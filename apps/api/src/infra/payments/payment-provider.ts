import type { FailureReason, PayNetwork } from '@fundizo/shared';

/**
 * The only way the app talks to a mobile money provider (CLAUDE.md: external systems sit behind
 * adapters). The fake runs in dev and tests; ZynlePay's sandbox arrives in slice 8 (ADR 0002).
 * Disbursement methods join in slice 15 (withdrawals).
 */
export type ProviderName = 'FAKE' | 'ZYNLE';

export interface CollectRequest {
  /** Our payment-attempt id: the provider's reference, so a repeat can't charge twice. */
  reference: string;
  phoneE164: string;
  network: PayNetwork;
  /** Donation + tip, in ngwee. */
  amountNgwee: number;
  /** Shown on the donor's phone where the network supports it. */
  description: string;
}

export interface CollectResult {
  /** False when the provider refused at once (e.g. not a mobile money number). */
  accepted: boolean;
  providerRef?: string;
  failureReason?: FailureReason;
}

/** Every provider status maps to ours (SPEC → adapter contract). */
export interface ProviderStatus {
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED' | 'EXPIRED' | 'UNKNOWN';
  failureReason?: FailureReason;
  /** What the network kept, in ngwee (successful payments only). */
  feeNgwee?: number;
}

/** A callback only tells us WHICH payment to check; we never act on its content (money rule 7). */
export interface CallbackHint {
  reference: string;
}

export type CallbackHeaders = Record<string, string | string[] | undefined>;

export interface PaymentProvider {
  readonly name: ProviderName;
  collect(req: CollectRequest): Promise<CollectResult>;
  getCollectionStatus(reference: string): Promise<ProviderStatus>;
  /** Authenticates the callback; null if it isn't genuine or isn't understood. */
  parseCallback(headers: CallbackHeaders, body: unknown): CallbackHint | null;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
