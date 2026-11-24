import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import fc from 'fast-check';
import pg from 'pg';
import type { App } from 'supertest/types.js';
import { DB, type Database } from '../src/infra/database/database.module.js';
import { LedgerService } from '../src/modules/ledger/ledger.service.js';
import {
  type AccountRef,
  LedgerConflictError,
  type Posting,
  accountKey,
  signedBalance,
} from '../src/modules/ledger/posting.js';
import { createTestApp, resetData } from './helpers.js';
import { balancedPosting } from './ledger-arbitraries.js';

/**
 * The ledger against real Postgres (F-06): random histories always balance, replays are safe, and
 * the database itself refuses edits, deletes and unbalanced transactions, whoever tries.
 */
let app: INestApplication<App>;
let ledger: LedgerService;
let db: Database;

beforeAll(async () => {
  await resetData();
  app = await createTestApp();
  ledger = app.get(LedgerService);
  db = app.get(DB);
});
afterAll(() => app.close());

const post = (p: Posting) => db.transaction((tx) => ledger.post(tx, p));

async function sql(url: string | undefined, query: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    return await client.query(query);
  } finally {
    await client.end();
  }
}
const asApp = (q: string) => sql(process.env.DATABASE_URL, q);
const asOwner = (q: string) => sql(process.env.MIGRATION_DATABASE_URL, q);

describe('random histories (property-based, real database)', () => {
  it('every account equals the sum of its lines, and the books always balance', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(balancedPosting, { minLength: 1, maxLength: 8 }),
        async (postings) => {
          const before = await ledger.overview(0);
          const expected = new Map<string, { ref: AccountRef; d: bigint; c: bigint }>();
          for (const p of postings) {
            await post(p);
            for (const l of p.lines) {
              const key = JSON.stringify(accountKey(l.account));
              const e = expected.get(key) ?? { ref: l.account, d: 0n, c: 0n };
              e.d += BigInt(l.debitNgwee ?? 0);
              e.c += BigInt(l.creditNgwee ?? 0);
              expected.set(key, e);
            }
          }
          const after = await ledger.overview(0);
          // Double entry: total debits = total credits, before and after.
          expect(after.totalDebitsNgwee).toBe(after.totalCreditsNgwee);
          expect(after.transactionCount).toBe(before.transactionCount + postings.length);
          // Each touched campaign account moved by exactly what we posted to it.
          for (const { ref, d, c } of expected.values()) {
            if (ref.kind !== 'campaign_funds') continue;
            expect(await ledger.balance(ref)).toBe(Number(signedBalance(ref.kind, d, c)));
          }
        },
      ),
      { numRuns: 40 },
    );
  });

  it('the accounting equation holds: debit-normal balances = credit-normal balances', async () => {
    const { accounts } = await ledger.overview(0);
    const debitSide = accounts
      .filter((a) => a.kind === 'provider_clearing' || a.kind === 'network_fees')
      .reduce((s, a) => s + BigInt(a.balanceNgwee), 0n);
    const creditSide = accounts
      .filter((a) => a.kind === 'campaign_funds' || a.kind === 'platform_tips')
      .reduce((s, a) => s + BigInt(a.balanceNgwee), 0n);
    expect(accounts.length).toBeGreaterThan(0);
    expect(debitSide).toBe(creditSide);
  });
});

describe('idempotency', () => {
  const campaignId = randomUUID();
  const donation = (amount: number): Posting => ({
    kind: 'donation_settled',
    ref: { type: 'payment_attempt', id: 'attempt-1' },
    lines: [
      {
        account: { kind: 'provider_clearing', provider: 'FAKE', network: 'MTN' },
        debitNgwee: amount,
      },
      { account: { kind: 'campaign_funds', campaignId }, creditNgwee: amount },
    ],
  });

  it('posting the same thing twice records it once', async () => {
    const first = await post(donation(5_000));
    const again = await post(donation(5_000));
    expect(first.created).toBe(true);
    expect(again).toEqual({ transactionId: first.transactionId, created: false });
    expect(await ledger.balance({ kind: 'campaign_funds', campaignId })).toBe(5_000);
  });

  it('the same key with different amounts is refused, never silently accepted', async () => {
    await expect(post(donation(9_999))).rejects.toBeInstanceOf(LedgerConflictError);
    expect(await ledger.balance({ kind: 'campaign_funds', campaignId })).toBe(5_000);
  });

  it('ten simultaneous posts of one key write exactly one transaction', async () => {
    const id = randomUUID();
    const p: Posting = { ...donation(700), ref: { type: 'payment_attempt', id } };
    const results = await Promise.all(Array.from({ length: 10 }, () => post(p)));
    expect(results.filter((r) => r.created)).toHaveLength(1);
    expect(new Set(results.map((r) => r.transactionId)).size).toBe(1);
    expect(await ledger.balance({ kind: 'campaign_funds', campaignId })).toBe(5_700);
  });

  it('a posting rolls back with the business change around it', async () => {
    const other = randomUUID();
    await expect(
      db.transaction(async (tx) => {
        await ledger.post(tx, {
          kind: 'donation_settled',
          ref: { type: 'payment_attempt', id: randomUUID() },
          lines: [
            { account: { kind: 'platform_tips' }, debitNgwee: 1 },
            { account: { kind: 'campaign_funds', campaignId: other }, creditNgwee: 1 },
          ],
        });
        throw new Error('the business change failed');
      }),
    ).rejects.toThrow('the business change failed');
    expect(await ledger.balance({ kind: 'campaign_funds', campaignId: other })).toBe(0);
  });
});

describe('the database enforces the rules (not just the code)', () => {
  it('the app login cannot UPDATE or DELETE ledger rows (grants)', async () => {
    await expect(
      asApp('update ledger_entries set credit_ngwee = credit_ngwee + 1'),
    ).rejects.toThrow(/permission denied/);
    await expect(asApp('delete from ledger_entries')).rejects.toThrow(/permission denied/);
    await expect(asApp('delete from ledger_transactions')).rejects.toThrow(/permission denied/);
    await expect(asApp('truncate ledger_entries')).rejects.toThrow(/permission denied/);
  });

  it('even the owner cannot change, delete or truncate them (triggers)', async () => {
    await expect(
      asOwner('update ledger_entries set credit_ngwee = credit_ngwee + 1'),
    ).rejects.toThrow(/append-only/);
    await expect(asOwner('delete from ledger_transactions')).rejects.toThrow(/append-only/);
    await expect(asOwner('truncate ledger_entries cascade')).rejects.toThrow(/append-only/);
    await expect(asOwner('update ledger_accounts set kind = kind')).rejects.toThrow(/append-only/);
  });

  it('an unbalanced transaction written by hand fails at COMMIT', async () => {
    const attempt = `
      begin;
      with t as (insert into ledger_transactions (kind, ref_type, ref_id) values ('hand', 'test', '${randomUUID()}') returning id),
           a as (select id from ledger_accounts limit 1)
      insert into ledger_entries (transaction_id, account_id, debit_ngwee) select t.id, a.id, 100 from t, a;
      commit;`;
    await expect(asApp(attempt)).rejects.toThrow(/unbalanced/);
    await expect(
      asApp(
        `begin; insert into ledger_transactions (kind, ref_type, ref_id) values ('hand', 'test', '${randomUUID()}'); commit;`,
      ),
    ).rejects.toThrow(/unbalanced/);
  });

  it('a line must be one positive side', async () => {
    const txn = randomUUID();
    await expect(
      asApp(`
        begin;
        insert into ledger_transactions (id, kind, ref_type, ref_id) values ('${txn}', 'hand', 'test', '${txn}');
        insert into ledger_entries (transaction_id, account_id, debit_ngwee, credit_ngwee)
          select '${txn}', id, -5, 0 from ledger_accounts limit 1;
        commit;`),
    ).rejects.toThrow(/ledger_entries_one_side/);
  });

  it('the app login can still do its normal work on other tables', async () => {
    await expect(asApp('select count(*) from users')).resolves.toBeDefined();
    await expect(asApp('delete from sessions where false')).resolves.toBeDefined();
  });
});
