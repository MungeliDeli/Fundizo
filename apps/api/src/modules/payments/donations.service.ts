import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  type CreateDonationRequest,
  type DonationView,
  FailureReason,
  type PayNetwork,
  PROMPT_SECONDS,
  type PublicDonationsResponse,
  type RetryDonationRequest,
  detectNetwork,
  formatLocalMobile,
  maskPhone,
  normaliseZambianMobile,
} from '@fundizo/shared';
import { and, count, desc, eq } from 'drizzle-orm';
import { AppError, Errors } from '../../common/app-error.js';
import { RateLimiter } from '../../common/rate-limiter.js';
import { ENV, type Env } from '../../config/env.js';
import {
  type DonationRow,
  type PaymentAttemptRow,
  donations,
  paymentAttempts,
} from '../../db/schema/index.js';
import { DB, type Database, type Tx } from '../../infra/database/database.module.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../../infra/payments/payment-provider.js';
import { OutboxService } from '../../jobs/outbox.service.js';
import { CampaignDirectory } from '../campaigns/campaign-directory.service.js';
import { PaymentAttemptCreated } from './events.js';

const HOUR = 3600;
/** After this many prompts for one donation, the donor starts a fresh donation instead. */
export const MAX_ATTEMPTS = 5;
const KEY_FORMAT = /^[A-Za-z0-9_-]{16,128}$/;

/**
 * Donations by guests (D-01 – D-10). Nobody logs in to give, so a donation's status is protected by
 * an access token handed to the device that started it (HMAC of the id; nothing to store or leak).
 * Every request that can move money carries an idempotency key (money rule 6).
 */
@Injectable()
export class DonationsService {
  private readonly log = new Logger(DonationsService.name);
  private readonly tokenKey: Buffer;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) env: Env,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly campaigns: CampaignDirectory,
    private readonly outbox: OutboxService,
    private readonly limiter: RateLimiter,
  ) {
    this.tokenKey = createHmac('sha256', env.AUTH_SECRET).update('donation-access-token').digest();
  }

  async create(
    body: CreateDonationRequest,
    idempotencyKey: string | undefined,
    ip: string | undefined,
  ): Promise<{ donation: DonationView; accessToken: string }> {
    const key = requireKey(idempotencyKey);
    const requestHash = hashRequest(body);
    const replay = await this.byKey(key, requestHash);
    if (replay) return this.withToken(replay);

    const phone = normaliseZambianMobile(body.phone);
    const network = phone ? payNetwork(phone) : null;
    if (!phone || !network) throw Errors.validation({ phone: 'Enter an MTN or Airtel number.' });
    await this.limiter.consume(`donate:ip:${ip ?? 'unknown'}`, 30, HOUR);
    await this.limiter.consume(`donate:phone:${digest(phone)}`, 10, HOUR);
    const campaign = await this.campaigns.getPublishedBySlug(body.campaignSlug);
    if (!campaign) throw Errors.notFound();

    const created = await this.db.transaction(async (tx) => {
      const [d] = await tx
        .insert(donations)
        .values({
          campaignId: campaign.id,
          amountNgwee: body.amountNgwee,
          tipNgwee: body.tipNgwee,
          anonymous: body.anonymous,
          donorName: body.anonymous ? null : (body.donorName ?? null),
          message: body.message || null,
          phoneE164: phone,
          network,
          idempotencyKey: key,
          requestHash,
        })
        .onConflictDoNothing({ target: donations.idempotencyKey })
        .returning();
      if (!d) return null; // the same key won a race; answer like a replay below
      await this.newAttempt(tx, d, phone, network, key);
      return d;
    });
    if (!created) {
      const again = await this.byKey(key, requestHash);
      if (!again) throw new Error('donation vanished');
      return this.withToken(again);
    }
    this.log.log(
      {
        donationId: created.id,
        network,
        phone: maskPhone(phone),
        totalNgwee: body.amountNgwee + body.tipNgwee,
      },
      'donation started',
    );
    return this.withToken(created.id);
  }

  async view(id: string, token: string | undefined): Promise<DonationView> {
    this.requireAccess(id, token);
    return this.toView(id);
  }

  /** Send a new prompt after a failed or expired one (D-08, "Try again" / "Send again"). */
  async retry(
    id: string,
    token: string | undefined,
    body: RetryDonationRequest,
    idempotencyKey: string | undefined,
    ip: string | undefined,
  ): Promise<DonationView> {
    this.requireAccess(id, token);
    const key = requireKey(idempotencyKey);
    const [existing] = await this.db
      .select({ donationId: paymentAttempts.donationId })
      .from(paymentAttempts)
      .where(eq(paymentAttempts.idempotencyKey, key));
    if (existing) {
      if (existing.donationId !== id) throw Errors.idempotencyConflict();
      return this.toView(id); // a replay of this retry
    }
    await this.limiter.consume(`donate:ip:${ip ?? 'unknown'}`, 30, HOUR);

    const phone = body.phone ? normaliseZambianMobile(body.phone) : null;
    const newNetwork = phone ? payNetwork(phone) : null;
    if (body.phone && (!phone || !newNetwork))
      throw Errors.validation({ phone: 'Enter an MTN or Airtel number.' });

    await this.db.transaction(async (tx) => {
      const [d] = await tx.select().from(donations).where(eq(donations.id, id)).for('update');
      if (!d) throw Errors.notFound();
      if (d.status === 'successful')
        throw paymentError('This gift has already been paid. Thank you!');
      if (d.status !== 'failed' && d.status !== 'expired') {
        throw paymentError('We’re still waiting for the network. Please don’t pay again.');
      }
      const [{ n } = { n: 0 }] = await tx
        .select({ n: count() })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.donationId, id));
      if (n >= MAX_ATTEMPTS) {
        throw paymentError(
          'That’s a lot of tries for one gift. Please start again from the fundraiser.',
        );
      }
      const last = await this.latestAttempt(id, tx);
      const usePhone = phone ?? last?.phoneE164 ?? d.phoneE164;
      const useNetwork = newNetwork ?? last?.network ?? d.network;
      await this.newAttempt(tx, d, usePhone, useNetwork, key);
      await tx.update(donations).set({ status: 'pending' }).where(eq(donations.id, id));
    });
    return this.toView(id);
  }

  /** The donor wall (U-04): successful gifts only, newest first. Never phone numbers. */
  async wall(slug: string, limit = 20): Promise<PublicDonationsResponse> {
    const campaign = await this.campaigns.getPublishedBySlug(slug);
    if (!campaign) throw Errors.notFound();
    const where = and(eq(donations.campaignId, campaign.id), eq(donations.status, 'successful'));
    const rows = await this.db
      .select({
        donorName: donations.donorName,
        anonymous: donations.anonymous,
        amountNgwee: donations.amountNgwee,
        message: donations.message,
        settledAt: donations.settledAt,
        createdAt: donations.createdAt,
      })
      .from(donations)
      .where(where)
      .orderBy(desc(donations.settledAt))
      .limit(limit);
    const [{ n } = { n: 0 }] = await this.db.select({ n: count() }).from(donations).where(where);
    return {
      donorCount: n,
      donations: rows.map((r) => ({
        name: r.anonymous ? null : r.donorName,
        amountNgwee: r.amountNgwee,
        message: r.message,
        createdAt: (r.settledAt ?? r.createdAt).toISOString(),
      })),
    };
  }

  /** For the dev network panel: the attempt currently waiting for this donation, if any. */
  async openAttemptId(donationId: string): Promise<string | null> {
    const a = await this.latestAttempt(donationId);
    return a && (a.status === 'pending' || a.status === 'unknown') ? a.id : null;
  }

  get providerName() {
    return this.provider.name;
  }

  private async newAttempt(
    tx: Tx,
    d: DonationRow,
    phone: string,
    network: PayNetwork,
    key: string,
  ) {
    const [a] = await tx
      .insert(paymentAttempts)
      .values({
        donationId: d.id,
        provider: this.provider.name,
        network,
        phoneE164: phone,
        amountNgwee: d.amountNgwee + d.tipNgwee,
        idempotencyKey: key,
      })
      .returning({ id: paymentAttempts.id });
    if (!a) throw new Error('attempt insert failed');
    await this.outbox.add(tx, PaymentAttemptCreated, { attemptId: a.id });
  }

  private async byKey(key: string, requestHash: string): Promise<string | null> {
    const [d] = await this.db
      .select({ id: donations.id, requestHash: donations.requestHash })
      .from(donations)
      .where(eq(donations.idempotencyKey, key));
    if (!d) return null;
    if (d.requestHash !== requestHash) throw Errors.idempotencyConflict();
    return d.id;
  }

  private async withToken(id: string) {
    return { donation: await this.toView(id), accessToken: this.token(id) };
  }

  private token(id: string): string {
    return createHmac('sha256', this.tokenKey).update(id).digest('base64url');
  }

  private requireAccess(id: string, token: string | undefined) {
    const expected = Buffer.from(this.token(id));
    const given = Buffer.from(token ?? '');
    // Wrong or missing token looks exactly like a missing donation.
    if (given.length !== expected.length || !timingSafeEqual(given, expected))
      throw Errors.notFound();
  }

  private async latestAttempt(donationId: string, exec: Database | Tx = this.db) {
    const [a] = await exec
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.donationId, donationId))
      .orderBy(desc(paymentAttempts.createdAt))
      .limit(1);
    return a ?? null;
  }

  private async toView(id: string): Promise<DonationView> {
    const [d] = await this.db.select().from(donations).where(eq(donations.id, id));
    if (!d) throw Errors.notFound();
    const [a, campaign, attempts] = await Promise.all([
      this.latestAttempt(id),
      this.campaigns.get(d.campaignId),
      this.db
        .select({ n: count() })
        .from(paymentAttempts)
        .where(eq(paymentAttempts.donationId, id)),
    ]);
    if (!a || !campaign?.slug) throw Errors.notFound();
    return viewOf(d, a, { slug: campaign.slug, title: campaign.title }, attempts[0]?.n ?? 0);
  }
}

function viewOf(
  d: DonationRow,
  a: PaymentAttemptRow,
  campaign: { slug: string; title: string },
  attempts: number,
): DonationView {
  const status = a.status === 'initiated' ? 'pending' : a.status;
  const started = (a.promptSentAt ?? a.createdAt).getTime();
  return {
    id: d.id,
    reference: `FZ-${d.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
    status,
    failureReason: status === 'failed' ? toFailure(a.failureReason) : null,
    amountNgwee: d.amountNgwee,
    tipNgwee: d.tipNgwee,
    totalNgwee: d.amountNgwee + d.tipNgwee,
    network: a.network,
    phone: formatLocalMobile(a.phoneE164),
    donorName: d.donorName,
    anonymous: d.anonymous,
    campaign,
    promptSent: a.status !== 'initiated',
    promptExpiresAt: new Date(started + PROMPT_SECONDS * 1000).toISOString(),
    canRetry: (status === 'failed' || status === 'expired') && attempts < MAX_ATTEMPTS,
  };
}

function toFailure(v: string | null): FailureReason {
  const parsed = FailureReason.safeParse(v);
  return parsed.success ? parsed.data : 'declined';
}

function payNetwork(e164: string): PayNetwork | null {
  const n = detectNetwork(e164);
  return n === 'MTN' || n === 'AIRTEL' ? n : null;
}

function requireKey(key: string | undefined): string {
  if (!key || !KEY_FORMAT.test(key)) {
    throw new AppError('validation_failed', 400, 'Missing or invalid Idempotency-Key header.');
  }
  return key;
}

function hashRequest(body: CreateDonationRequest): string {
  const canonical = JSON.stringify(Object.entries(body).toSorted(([a], [b]) => a.localeCompare(b)));
  return digest(canonical);
}

function digest(v: string) {
  return createHash('sha256').update(v).digest('hex');
}

function paymentError(message: string) {
  return new AppError('payment_in_progress', 409, message);
}
