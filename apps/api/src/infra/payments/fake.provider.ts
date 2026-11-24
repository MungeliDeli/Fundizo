import { createHmac, timingSafeEqual } from 'node:crypto';
import { type FailureReason, PROMPT_SECONDS, maskPhone } from '@fundizo/shared';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { ensureConnected } from '../redis/redis.module.js';
import type {
  CallbackHeaders,
  CallbackHint,
  CollectRequest,
  CollectResult,
  PaymentProvider,
  ProviderStatus,
} from './payment-provider.js';

/** Pretend network fee agreed for dev: 2% of what the donor pays (2026-11-24), half-up to the ngwee. */
export const FAKE_FEE_BASIS_POINTS = 200;
export function fakeFee(totalNgwee: number): number {
  return Math.floor((totalNgwee * FAKE_FEE_BASIS_POINTS + 5_000) / 10_000);
}

export const FAKE_OUTCOMES = [
  'approve',
  'insufficient_funds',
  'wrong_pin',
  'cancelled',
  'expire',
  'ambiguous',
] as const;
export type FakeOutcome = (typeof FAKE_OUTCOMES)[number];

const FakeRecord = z.object({
  reference: z.string(),
  network: z.enum(['MTN', 'AIRTEL']),
  maskedPhone: z.string(),
  amountNgwee: z.number().int(),
  status: z.enum(['PENDING', 'SUCCESSFUL', 'FAILED', 'EXPIRED', 'UNKNOWN']),
  failureReason: z
    .enum(['insufficient_funds', 'wrong_pin', 'cancelled', 'declined', 'not_sent'])
    .optional(),
  feeNgwee: z.number().int().optional(),
  createdAt: z.number().int(),
});
export type FakeRecord = z.infer<typeof FakeRecord>;

const CallbackBody = z.strictObject({
  reference: z.uuid(),
  status: z.string().max(20),
  timestamp: z.number().int(),
});

const KEY = (ref: string) => `fakepay:${ref}`;
const INDEX = 'fakepay:index';
const TTL = 7 * 24 * 3600;

/**
 * A pretend mobile money network for development and tests (no money moves). Requests wait until
 * someone "plays the network" on the dev panel, or expire after PROMPT_SECONDS, like a real prompt.
 * Never used in production (config refuses it).
 */
export class FakeProvider implements PaymentProvider {
  readonly name = 'FAKE' as const;

  constructor(
    private readonly redis: Redis,
    private readonly secret: string,
    private readonly now: () => number = Date.now,
  ) {}

  async collect(req: CollectRequest): Promise<CollectResult> {
    await ensureConnected(this.redis);
    const providerRef = `FAKE-${req.reference.slice(0, 8).toUpperCase()}`;
    const record: FakeRecord = {
      reference: req.reference,
      network: req.network,
      maskedPhone: maskPhone(req.phoneE164),
      amountNgwee: req.amountNgwee,
      status: 'PENDING',
      createdAt: this.now(),
    };
    // Same reference twice = the same request (like a real provider), never a second prompt.
    const created = await this.redis.set(
      KEY(req.reference),
      JSON.stringify(record),
      'EX',
      TTL,
      'NX',
    );
    if (created) await this.redis.zadd(INDEX, record.createdAt, req.reference);
    return { accepted: true, providerRef };
  }

  async getCollectionStatus(reference: string): Promise<ProviderStatus> {
    const rec = await this.get(reference);
    if (!rec) return { status: 'FAILED', failureReason: 'not_sent' };
    if (rec.status === 'PENDING' && this.now() - rec.createdAt > PROMPT_SECONDS * 1000) {
      rec.status = 'EXPIRED';
      await this.save(rec);
    }
    return {
      status: rec.status,
      ...(rec.failureReason ? { failureReason: rec.failureReason } : {}),
      ...(rec.feeNgwee !== undefined ? { feeNgwee: rec.feeNgwee } : {}),
    };
  }

  /**
   * Dev panel: decide what the "network" does with a waiting request. Returns the signed callback
   * the network would send. An ambiguous result can still be decided later, like a real one.
   */
  async decide(
    reference: string,
    outcome: FakeOutcome,
  ): Promise<{ headers: CallbackHeaders; body: unknown } | null> {
    const rec = await this.get(reference);
    if (!rec || (rec.status !== 'PENDING' && rec.status !== 'UNKNOWN')) return null;
    const failure: Partial<Record<FakeOutcome, FailureReason>> = {
      insufficient_funds: 'insufficient_funds',
      wrong_pin: 'wrong_pin',
      cancelled: 'cancelled',
    };
    if (outcome === 'approve') {
      rec.status = 'SUCCESSFUL';
      rec.feeNgwee = fakeFee(rec.amountNgwee);
    } else if (outcome === 'expire') rec.status = 'EXPIRED';
    else if (outcome === 'ambiguous') rec.status = 'UNKNOWN';
    else {
      rec.status = 'FAILED';
      rec.failureReason = failure[outcome];
    }
    await this.save(rec);
    return this.signedCallback(reference, rec.status);
  }

  async list(limit = 20): Promise<FakeRecord[]> {
    await ensureConnected(this.redis);
    const refs = await this.redis.zrevrange(INDEX, 0, limit - 1);
    const out: FakeRecord[] = [];
    for (const ref of refs) {
      const rec = await this.get(ref);
      if (rec) out.push(rec);
    }
    return out;
  }

  parseCallback(headers: CallbackHeaders, body: unknown): CallbackHint | null {
    const parsed = CallbackBody.safeParse(body);
    const signature = headers['x-fake-signature'];
    if (!parsed.success || typeof signature !== 'string') return null;
    const { reference, status, timestamp } = parsed.data;
    if (Math.abs(this.now() - timestamp) > 5 * 60_000) return null;
    const expected = Buffer.from(this.sign(reference, status, timestamp), 'hex');
    const given = Buffer.from(signature, 'hex');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    return { reference };
  }

  signedCallback(reference: string, status: string) {
    const timestamp = this.now();
    return {
      headers: { 'x-fake-signature': this.sign(reference, status, timestamp) },
      body: { reference, status, timestamp },
    };
  }

  private sign(reference: string, status: string, timestamp: number) {
    return createHmac('sha256', this.secret)
      .update(`${reference}.${status}.${timestamp}`)
      .digest('hex');
  }

  private async get(reference: string): Promise<FakeRecord | null> {
    await ensureConnected(this.redis);
    const raw = await this.redis.get(KEY(reference));
    if (!raw) return null;
    const parsed = FakeRecord.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  }

  private async save(rec: FakeRecord) {
    await this.redis.set(KEY(rec.reference), JSON.stringify(rec), 'EX', TTL);
  }
}
