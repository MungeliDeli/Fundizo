import fc from 'fast-check';
import { account, balancedPosting } from '../../../test/ledger-arbitraries.js';
import {
  type AccountRef,
  LedgerError,
  type Posting,
  type PostingLine,
  signedBalance,
  toNgwee,
  validatePosting,
} from './posting.js';

/**
 * Property-based tests for the ledger's pure rules (CLAUDE.md money rule 4). fast-check generates
 * hundreds of random postings per property and shrinks any failure to the smallest example.
 */

const sum = (p: Posting, side: 'debitNgwee' | 'creditNgwee') =>
  p.lines.reduce((s, l) => s + (l[side] ?? 0), 0);

describe('validatePosting (property-based)', () => {
  it('accepts every balanced posting', () => {
    fc.assert(
      fc.property(balancedPosting, (p) => {
        expect(sum(p, 'debitNgwee')).toBe(sum(p, 'creditNgwee'));
        validatePosting(p);
      }),
      { numRuns: 500 },
    );
  });

  it('rejects any posting whose debits and credits differ, by even one ngwee', () => {
    fc.assert(
      fc.property(balancedPosting, fc.integer({ min: 1, max: 1_000_000 }), (p, extra) => {
        const [first, ...rest] = p.lines;
        if (!first) return;
        const bumped: PostingLine =
          first.debitNgwee !== undefined
            ? { account: first.account, debitNgwee: first.debitNgwee + extra }
            : { account: first.account, creditNgwee: first.creditNgwee + extra };
        expect(() => validatePosting({ ...p, lines: [bumped, ...rest] })).toThrow(LedgerError);
      }),
      { numRuns: 500 },
    );
  });

  it('rejects zero, negative, fractional and unsafe amounts', () => {
    const bad = fc.oneof(
      fc.constant(0),
      fc.integer({ min: -1_000_000, max: -1 }),
      fc.double({ min: 0.001, max: 1e6, noInteger: true, noNaN: true }),
      fc.constant(Number.MAX_SAFE_INTEGER + 1),
      fc.constant(Number.NaN),
      fc.constant(Number.POSITIVE_INFINITY),
    );
    fc.assert(
      fc.property(bad, account, account, (x, a, b) => {
        expect(() =>
          validatePosting({
            kind: 'test',
            ref: { type: 'test', id: '1' },
            lines: [
              { account: a, debitNgwee: x },
              { account: b, creditNgwee: x },
            ],
          }),
        ).toThrow(LedgerError);
      }),
    );
  });

  it('rejects one-line postings and lines with both sides', () => {
    const a: AccountRef = { kind: 'platform_tips' };
    expect(() =>
      validatePosting({
        kind: 'x',
        ref: { type: 't', id: '1' },
        lines: [{ account: a, debitNgwee: 1 }],
      }),
    ).toThrow(/at least two/);
    // Types forbid a line with both sides; build one anyway, as untyped input could.
    const both: PostingLine = { account: a, debitNgwee: 1 };
    Reflect.set(both, 'creditNgwee', 1);
    expect(() =>
      validatePosting({
        kind: 'x',
        ref: { type: 't', id: '1' },
        lines: [both, { account: a, creditNgwee: 1 }],
      }),
    ).toThrow(LedgerError);
  });

  it('rejects odd names that could hide mistakes', () => {
    const lines: PostingLine[] = [
      { account: { kind: 'platform_tips' }, debitNgwee: 1 },
      { account: { kind: 'platform_tips' }, creditNgwee: 1 },
    ];
    expect(() =>
      validatePosting({ kind: 'Bad Kind', ref: { type: 't', id: '1' }, lines }),
    ).toThrow();
    expect(() => validatePosting({ kind: 'ok', ref: { type: 't', id: '' }, lines })).toThrow();
  });
});

describe('balances', () => {
  it('a credit-normal and a debit-normal account always mirror each other', () => {
    fc.assert(
      fc.property(
        fc.bigInt({ min: 0n, max: 10n ** 15n }),
        fc.bigInt({ min: 0n, max: 10n ** 15n }),
        (d, c) => {
          expect(signedBalance('campaign_funds', d, c)).toBe(
            -signedBalance('provider_clearing', d, c),
          );
        },
      ),
    );
  });

  it('toNgwee refuses numbers JavaScript cannot hold exactly', () => {
    expect(toNgwee(9_007_199_254_740_991n)).toBe(Number.MAX_SAFE_INTEGER);
    expect(() => toNgwee(9_007_199_254_740_992n)).toThrow(LedgerError);
  });
});
