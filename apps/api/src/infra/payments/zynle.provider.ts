import { timingSafeEqual } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { type FailureReason, maskPhone } from '@fundizo/shared';
import { z } from 'zod';
import type {
  CallbackHint,
  CallbackRequest,
  CollectRequest,
  CollectResult,
  PaymentProvider,
  ProviderStatus,
} from './payment-provider.js';

/**
 * ZynlePay (Zynle Fintech, Zambia): MTN and Airtel collections through one aggregator (ADR 0002,
 * slice 8). Built from ZynlePay's public API pages ("MOMO DEPOSIT", "PAYMENT STATUS"); the open
 * questions are listed in docs/features/D-06-zynlepay.md and every guess is a setting, not code.
 *
 * - The reference we send is our payment-attempt id without dashes (32 hex characters).
 * - Amounts leave as whole units of ZYNLE_AMOUNT_UNIT; never rounded (money rule 1).
 * - Callbacks carry no signature, so the callback URL ends in a secret token, and a callback only
 *   triggers a status check (money rule 7).
 * - Anything unclear maps to PENDING (keep checking) or UNKNOWN (never success; money rule 8).
 */
export interface ZynleConfig {
  baseUrl: string;
  statusUrl: string;
  merchantId: string;
  apiId: string;
  apiKey: string;
  callbackToken: string;
  amountUnit: 'kwacha' | 'ngwee';
  phoneFormat: 'international' | 'local';
  feeBasisPoints: number;
}

const TIMEOUT_MS = 20_000;

/** Codes in ZynlePay responses (strings in their JSON, sometimes numbers). */
const Code = z.union([z.string(), z.number()]).transform(String);

const InitialResponse = z.looseObject({
  response_code: Code,
  response_description: z.string().optional(),
  transaction_id: z.union([z.string(), z.number()]).optional(),
});

export const StatusResponse = z.looseObject({
  response_code: Code,
  message: z.string().optional(),
  response_description: z.string().optional(),
  transaction_status: z.string().optional(),
  transaction_result: z.looseObject({ code: Code.optional() }).optional(),
  provider_code: Code.optional(),
});

const CallbackBody = z.looseObject({
  reference_no: z.union([z.string(), z.number()]).transform(String),
});

/** Provider (network) result codes → our failure reasons (ZynlePay "Provider Transaction Responses"). */
const PROVIDER_FAILURES: Record<string, FailureReason> = {
  '889': 'cancelled', // PIN not provided
  '891': 'not_sent', // not registered / barred
  '892': 'declined',
  '893': 'declined', // invalid amount
  '894': 'wrong_pin',
  '895': 'insufficient_funds',
  '896': 'declined', // transaction limit exceeded
  '897': 'not_sent', // invalid mobile number
};
/** Answers that are never success and never a final failure: settled later (unknown). */
const AMBIGUOUS = new Set(['899', '999']);
/** The request never reached a phone. */
const NOT_SENT = new Set(['2000', '9905', '9907']);
/** Our own setup is wrong: say so loudly, and tell the donor the prompt couldn't be sent. */
const MERCHANT_PROBLEMS = new Set([
  '9900',
  '9901',
  '9902',
  '9903',
  '9904',
  '9908',
  '9909',
  '9910',
  '9911',
]);

export class ZynleProvider implements PaymentProvider {
  readonly name = 'ZYNLE' as const;
  private readonly log = new Logger(ZynleProvider.name);

  constructor(
    private readonly cfg: ZynleConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async collect(req: CollectRequest): Promise<CollectResult> {
    const body = {
      auth: {
        merchant_id: this.cfg.merchantId,
        api_id: this.cfg.apiId,
        api_key: this.cfg.apiKey,
        channel: 'momo',
      },
      data: {
        method: 'runBillPayment',
        sender_id: this.phone(req.phoneE164),
        reference_no: toReference(req.reference),
        amount: this.amount(req.amountNgwee),
      },
    };
    const res = await this.post(this.cfg.baseUrl, body);
    const parsed = InitialResponse.safeParse(res);
    if (!parsed.success) throw new Error('ZynlePay: unreadable deposit response');
    const code = parsed.data.response_code;
    const ctx = { reference: req.reference, phone: maskPhone(req.phoneE164), code };

    // 120 initiated. A duplicate reference means it was already sent: the status checks follow it.
    if (code === '120' || code === '990' || code === '9906') {
      return {
        accepted: true,
        ...(parsed.data.transaction_id !== undefined
          ? { providerRef: String(parsed.data.transaction_id) }
          : {}),
      };
    }
    if (MERCHANT_PROBLEMS.has(code)) {
      this.log.error(
        { ...ctx, description: parsed.data.response_description },
        'ZynlePay refused our merchant setup',
      );
      return { accepted: false, failureReason: 'not_sent' };
    }
    this.log.warn(ctx, 'ZynlePay did not start the payment');
    if (NOT_SENT.has(code)) return { accepted: false, failureReason: 'not_sent' };
    if (code === '995') return { accepted: false, failureReason: 'declined' };
    // 9912 over the limit, 9915 invalid amount, anything else: declined, nothing was charged.
    return { accepted: false, failureReason: PROVIDER_FAILURES[code] ?? 'declined' };
  }

  async getCollectionStatus(reference: string, amountNgwee: number): Promise<ProviderStatus> {
    let res: unknown;
    try {
      res = await this.post(this.cfg.statusUrl, {
        api_id: this.cfg.apiId,
        api_key: this.cfg.apiKey,
        reference_no: toReference(reference),
      });
    } catch (err) {
      // A failed check isn't an answer: keep checking (the last scheduled check makes it UNKNOWN).
      this.log.warn({ reference, err }, 'ZynlePay status check failed');
      return { status: 'PENDING' };
    }
    const parsed = StatusResponse.safeParse(res);
    if (!parsed.success) return { status: 'PENDING' };
    return mapStatus(parsed.data, this.fee(amountNgwee));
  }

  parseCallback({ body, pathToken }: CallbackRequest): CallbackHint | null {
    if (!pathToken || !safeEqual(pathToken, this.cfg.callbackToken)) return null;
    const parsed = CallbackBody.safeParse(body);
    if (!parsed.success) return null;
    const reference = fromReference(parsed.data.reference_no);
    return reference ? { reference } : null;
  }

  acknowledge(hint: CallbackHint): unknown {
    return { response_code: '130', reference_no: toReference(hint.reference) };
  }

  /** The fee is computed from the rate card; ZynlePay's documented responses don't include it. */
  fee(amountNgwee: number): number {
    return Math.floor((amountNgwee * this.cfg.feeBasisPoints + 5_000) / 10_000);
  }

  private amount(ngwee: number): string {
    if (this.cfg.amountUnit === 'ngwee') return String(ngwee);
    if (ngwee % 100 !== 0) throw new Error('ZynlePay amount must be whole kwacha');
    return String(ngwee / 100);
  }

  private phone(e164: string): string {
    const national = e164.replace(/^\+260/, '');
    return this.cfg.phoneFormat === 'local' ? `0${national}` : `260${national}`;
  }

  private async post(url: string, body: unknown): Promise<unknown> {
    const res = await this.fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as unknown;
    } catch {
      // Never log the request (it has the API key); the response has no secrets.
      throw new Error(`ZynlePay answered ${res.status} with non-JSON: ${text.slice(0, 120)}`);
    }
  }
}

/** One status answer → ours. `feeNgwee` is what the rate card says this payment costs. */
export function mapStatus(r: z.infer<typeof StatusResponse>, feeNgwee: number): ProviderStatus {
  const provider = r.transaction_result?.code ?? r.provider_code;
  const code = r.response_code;
  // An ambiguous network answer outranks everything: contradictory data is never success.
  if (provider && AMBIGUOUS.has(provider)) return { status: 'UNKNOWN' };
  if (code === '100' && (!provider || provider === '100'))
    return { status: 'SUCCESSFUL', feeNgwee };
  if (code === '100') return { status: 'UNKNOWN' }; // outer success, network says otherwise
  if (provider === '898') return { status: 'EXPIRED' };
  if (code === '995') {
    return {
      status: 'FAILED',
      failureReason: (provider && PROVIDER_FAILURES[provider]) || 'declined',
    };
  }
  if (code === '2000') return { status: 'FAILED', failureReason: 'not_sent' };
  // 990 (in progress / not found yet), 500, 9914 (can't tell now), anything else: keep checking.
  return { status: 'PENDING' };
}

/** Our attempt id → ZynlePay reference: the same UUID, without dashes (letters and digits only). */
export function toReference(attemptId: string): string {
  return attemptId.replace(/-/g, '');
}

export function fromReference(ref: string): string | null {
  const hex = ref.toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) return null;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
