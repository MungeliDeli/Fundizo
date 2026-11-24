/**
 * The ledger's public types and the pure rules every posting must pass (F-06). Kept free of the
 * database so they can be property-tested on their own (posting.spec.ts).
 */
export type Provider = 'FAKE' | 'ZYNLE';
export type Network = 'MTN' | 'AIRTEL';

/** Which account a line touches. Accounts are created on first use. */
export type AccountRef =
  | { kind: 'campaign_funds'; campaignId: string }
  | { kind: 'platform_tips' }
  | { kind: 'network_fees'; provider: Provider; network: Network }
  | { kind: 'provider_clearing'; provider: Provider; network: Network };

export type AccountKind = AccountRef['kind'];

/** Liabilities and revenue grow with credits; assets and expenses grow with debits. */
export const NORMAL_BALANCE: Record<AccountKind, 'debit' | 'credit'> = {
  campaign_funds: 'credit',
  platform_tips: 'credit',
  network_fees: 'debit',
  provider_clearing: 'debit',
};

export type PostingLine =
  | { account: AccountRef; debitNgwee: number; creditNgwee?: undefined }
  | { account: AccountRef; creditNgwee: number; debitNgwee?: undefined };

export interface Posting {
  /** What happened, e.g. 'donation_settled'. Lowercase words and underscores. */
  kind: string;
  /** The business record it belongs to. (kind, ref) is the idempotency key. */
  ref: { type: string; id: string };
  lines: PostingLine[];
}

export class LedgerError extends Error {
  override name = 'LedgerError';
}

/** Same posting key, different lines: a bug upstream. Never silently accept it. */
export class LedgerConflictError extends LedgerError {
  override name = 'LedgerConflictError';
}

const NAME = /^[a-z][a-z0-9_]{0,63}$/;

/** Throws LedgerError unless the posting is well formed and balanced. Money stays integer ngwee. */
export function validatePosting(p: Posting): void {
  if (!NAME.test(p.kind)) throw new LedgerError(`bad posting kind "${p.kind}"`);
  if (!NAME.test(p.ref.type)) throw new LedgerError(`bad ref type "${p.ref.type}"`);
  if (p.ref.id.length < 1 || p.ref.id.length > 128) throw new LedgerError('bad ref id');
  if (p.lines.length < 2) throw new LedgerError('a posting needs at least two lines');
  let debits = 0n;
  let credits = 0n;
  for (const line of p.lines) {
    const amount = line.debitNgwee ?? line.creditNgwee;
    if (line.debitNgwee !== undefined && line.creditNgwee !== undefined) {
      throw new LedgerError('a line is either a debit or a credit');
    }
    if (amount === undefined || !Number.isSafeInteger(amount) || amount <= 0) {
      throw new LedgerError('line amounts must be positive whole ngwee');
    }
    if (line.debitNgwee !== undefined) debits += BigInt(amount);
    else credits += BigInt(amount);
  }
  if (debits !== credits) {
    throw new LedgerError(`unbalanced posting: debits ${debits} ≠ credits ${credits}`);
  }
  if (debits > BigInt(Number.MAX_SAFE_INTEGER)) throw new LedgerError('posting too large');
}

/** Account columns for a ref: the identity used for lookups and the unique constraint. */
export function accountKey(ref: AccountRef) {
  return {
    kind: ref.kind,
    ownerId: ref.kind === 'campaign_funds' ? ref.campaignId : null,
    provider: 'provider' in ref ? ref.provider : null,
    network: 'network' in ref ? ref.network : null,
  };
}

/** Signed balance in the account's own direction, from raw sums (bigint, never float). */
export function signedBalance(kind: AccountKind, debits: bigint, credits: bigint): bigint {
  return NORMAL_BALANCE[kind] === 'credit' ? credits - debits : debits - credits;
}

/** Ngwee leave the ledger as JS numbers only when they fit exactly. */
export function toNgwee(v: bigint): number {
  if (v > BigInt(Number.MAX_SAFE_INTEGER) || v < BigInt(Number.MIN_SAFE_INTEGER)) {
    throw new LedgerError('balance outside the safe integer range');
  }
  return Number(v);
}
