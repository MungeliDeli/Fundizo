import fc from 'fast-check';
import type { AccountRef, Posting, PostingLine } from '../src/modules/ledger/posting.js';

/** fast-check generators for ledger postings, shared by the unit and database property tests. */
export const account: fc.Arbitrary<AccountRef> = fc.oneof(
  fc.uuid().map((campaignId) => ({ kind: 'campaign_funds' as const, campaignId })),
  fc.constant({ kind: 'platform_tips' as const }),
  fc
    .constantFrom('MTN' as const, 'AIRTEL' as const)
    .map((network) => ({ kind: 'provider_clearing' as const, provider: 'FAKE' as const, network })),
  fc
    .constantFrom('MTN' as const, 'AIRTEL' as const)
    .map((network) => ({ kind: 'network_fees' as const, provider: 'FAKE' as const, network })),
);

const amount = fc.integer({ min: 1, max: 1_000_000_000 }); // up to K10 million in ngwee

/** A random balanced posting: random debits, and the same total split randomly into credits. */
export const balancedPosting: fc.Arbitrary<Posting> = fc
  .tuple(
    fc.array(fc.tuple(account, amount), { minLength: 1, maxLength: 4 }),
    fc.array(account, { minLength: 1, maxLength: 4 }),
    fc.array(fc.integer({ min: 1, max: 100 }), { minLength: 4, maxLength: 4 }),
    fc.uuid(),
  )
  .filter(([debits, credits]) => debits.reduce((s, [, a]) => s + a, 0) >= credits.length)
  .map(([debits, creditAccounts, weights, id]) => {
    const total = debits.reduce((s, [, a]) => s + a, 0);
    // Split `total` into creditAccounts.length positive integers by integer weights.
    const w = creditAccounts.map((_, i) => weights[i] ?? 1);
    const wSum = w.reduce((s, x) => s + x, 0);
    const parts = w.map((x) => Math.max(1, Math.floor((x * total) / wSum)));
    let diff = total - parts.reduce((s, p) => s + p, 0);
    for (let i = 0; diff !== 0; i = (i + 1) % parts.length) {
      const p = parts[i] ?? 0;
      const step = diff > 0 ? 1 : p > 1 ? -1 : 0;
      parts[i] = p + step;
      diff -= step;
    }
    const lines: PostingLine[] = [
      ...debits.map(([a, d]) => ({ account: a, debitNgwee: d })),
      ...creditAccounts.map((a, i) => ({ account: a, creditNgwee: parts[i] ?? 0 })),
    ];
    return { kind: 'test_posting', ref: { type: 'test', id }, lines };
  });
