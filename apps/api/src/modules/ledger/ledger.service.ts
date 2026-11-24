import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { ledgerAccounts, ledgerEntries, ledgerTransactions } from '../../db/schema/index.js';
import { DB, type Database, type Executor, type Tx } from '../../infra/database/database.module.js';
import {
  type AccountKind,
  type AccountRef,
  LedgerConflictError,
  NORMAL_BALANCE,
  type Posting,
  accountKey,
  signedBalance,
  toNgwee,
  validatePosting,
} from './posting.js';

export interface PostResult {
  transactionId: string;
  /** False when this (kind, ref) was already posted: a safe replay, nothing new was written. */
  created: boolean;
}

export interface AccountLabelParts {
  kind: AccountKind;
  ownerId: string | null;
  provider: string | null;
  network: string | null;
}

export interface AccountSummary extends AccountLabelParts {
  balanceNgwee: number;
}

export interface LedgerOverview {
  accounts: AccountSummary[];
  /** Across every entry ever written. Equal, always: that's double entry. */
  totalDebitsNgwee: number;
  totalCreditsNgwee: number;
  transactionCount: number;
  recent: Array<{
    id: string;
    kind: string;
    refType: string;
    createdAt: string;
    lines: Array<{ account: AccountLabelParts; debitNgwee: number; creditNgwee: number }>;
  }>;
}

const sumText = (col: typeof ledgerEntries.debitNgwee | typeof ledgerEntries.creditNgwee) =>
  sql<string>`coalesce(sum(${col}), 0)::text`;

/**
 * The ledger (F-06): the one source of truth for money. Its public interface is deliberately
 * narrow: `post` (inside the caller's transaction, so the business change and its money movement
 * commit together; money rule 5) and balance reads. There is no update or delete, in code or in the
 * database (migration 0006: triggers + grants).
 */
@Injectable()
export class LedgerService {
  constructor(@Inject(DB) private readonly db: Database) {}

  /**
   * Record a balanced posting. Idempotent per (kind, ref): posting the same thing again returns
   * the original transaction; posting different lines under the same key throws.
   * The database re-checks the balance at COMMIT, so a bug here can't write unbalanced books.
   */
  async post(tx: Tx, posting: Posting): Promise<PostResult> {
    validatePosting(posting);
    const ids = await this.resolveAccounts(
      tx,
      posting.lines.map((l) => l.account),
    );
    const lines = posting.lines.map((l, i) => ({
      accountId: required(ids[i]),
      debitNgwee: l.debitNgwee ?? 0,
      creditNgwee: l.creditNgwee ?? 0,
    }));

    const [txn] = await tx
      .insert(ledgerTransactions)
      .values({ kind: posting.kind, refType: posting.ref.type, refId: posting.ref.id })
      .onConflictDoNothing({
        target: [ledgerTransactions.kind, ledgerTransactions.refType, ledgerTransactions.refId],
      })
      .returning({ id: ledgerTransactions.id });

    if (!txn) return this.replay(tx, posting, lines);

    await tx.insert(ledgerEntries).values(lines.map((l) => ({ ...l, transactionId: txn.id })));
    return { transactionId: txn.id, created: true };
  }

  /** One account's balance, in its normal direction (e.g. money held for a campaign). */
  async balance(ref: AccountRef, exec: Executor = this.db): Promise<number> {
    const [row] = await exec
      .select({ d: sumText(ledgerEntries.debitNgwee), c: sumText(ledgerEntries.creditNgwee) })
      .from(ledgerAccounts)
      .leftJoin(ledgerEntries, eq(ledgerEntries.accountId, ledgerAccounts.id))
      .where(keyFilter(ref));
    return row ? toNgwee(signedBalance(ref.kind, BigInt(row.d), BigInt(row.c))) : 0;
  }

  /** Money held for each campaign, for pages that list many. Missing = 0. */
  async campaignFunds(campaignIds: string[], exec: Executor = this.db) {
    const out = new Map<string, number>(campaignIds.map((id) => [id, 0]));
    if (campaignIds.length === 0) return out;
    const rows = await exec
      .select({
        ownerId: ledgerAccounts.ownerId,
        d: sumText(ledgerEntries.debitNgwee),
        c: sumText(ledgerEntries.creditNgwee),
      })
      .from(ledgerAccounts)
      .innerJoin(ledgerEntries, eq(ledgerEntries.accountId, ledgerAccounts.id))
      .where(
        and(
          eq(ledgerAccounts.kind, 'campaign_funds'),
          inArray(ledgerAccounts.ownerId, campaignIds),
        ),
      )
      .groupBy(ledgerAccounts.ownerId);
    for (const r of rows) {
      if (r.ownerId)
        out.set(r.ownerId, toNgwee(signedBalance('campaign_funds', BigInt(r.d), BigInt(r.c))));
    }
    return out;
  }

  /** Read-only summary of the books (the dev ledger page now; finance reports later, P-09). */
  async overview(limit = 20): Promise<LedgerOverview> {
    const accounts = await this.db
      .select({
        kind: ledgerAccounts.kind,
        ownerId: ledgerAccounts.ownerId,
        provider: ledgerAccounts.provider,
        network: ledgerAccounts.network,
        d: sumText(ledgerEntries.debitNgwee),
        c: sumText(ledgerEntries.creditNgwee),
      })
      .from(ledgerAccounts)
      .leftJoin(ledgerEntries, eq(ledgerEntries.accountId, ledgerAccounts.id))
      .groupBy(ledgerAccounts.id)
      .orderBy(ledgerAccounts.kind, ledgerAccounts.createdAt);

    const [totals] = await this.db
      .select({
        d: sumText(ledgerEntries.debitNgwee),
        c: sumText(ledgerEntries.creditNgwee),
        n: sql<number>`(select count(*)::int from ${ledgerTransactions})`,
      })
      .from(ledgerEntries);

    const txns = await this.db
      .select()
      .from(ledgerTransactions)
      .orderBy(desc(ledgerTransactions.createdAt))
      .limit(limit);
    const entries = txns.length
      ? await this.db
          .select({
            transactionId: ledgerEntries.transactionId,
            debitNgwee: ledgerEntries.debitNgwee,
            creditNgwee: ledgerEntries.creditNgwee,
            kind: ledgerAccounts.kind,
            ownerId: ledgerAccounts.ownerId,
            network: ledgerAccounts.network,
            provider: ledgerAccounts.provider,
          })
          .from(ledgerEntries)
          .innerJoin(ledgerAccounts, eq(ledgerAccounts.id, ledgerEntries.accountId))
          .where(
            inArray(
              ledgerEntries.transactionId,
              txns.map((t) => t.id),
            ),
          )
      : [];

    return {
      accounts: accounts.map((a) => ({
        kind: a.kind,
        ownerId: a.ownerId,
        provider: a.provider,
        network: a.network,
        balanceNgwee: toNgwee(signedBalance(a.kind, BigInt(a.d), BigInt(a.c))),
      })),
      totalDebitsNgwee: toNgwee(BigInt(totals?.d ?? '0')),
      totalCreditsNgwee: toNgwee(BigInt(totals?.c ?? '0')),
      transactionCount: totals?.n ?? 0,
      recent: txns.map((t) => ({
        id: t.id,
        kind: t.kind,
        refType: t.refType,
        createdAt: t.createdAt.toISOString(),
        lines: entries
          .filter((e) => e.transactionId === t.id)
          .map((e) => ({
            account: { kind: e.kind, ownerId: e.ownerId, provider: e.provider, network: e.network },
            debitNgwee: e.debitNgwee,
            creditNgwee: e.creditNgwee,
          })),
      })),
    };
  }

  /** Find or create each account (first use creates it). Same order as `refs`. */
  private async resolveAccounts(tx: Tx, refs: AccountRef[]): Promise<string[]> {
    const cache = new Map<string, string>();
    const out: string[] = [];
    for (const ref of refs) {
      const key = JSON.stringify(accountKey(ref));
      let id = cache.get(key);
      if (!id) {
        const [created] = await tx
          .insert(ledgerAccounts)
          .values({ ...accountKey(ref), normalBalance: NORMAL_BALANCE[ref.kind] })
          .onConflictDoNothing()
          .returning({ id: ledgerAccounts.id });
        id = created?.id;
        if (!id) {
          const [found] = await tx
            .select({ id: ledgerAccounts.id })
            .from(ledgerAccounts)
            .where(keyFilter(ref));
          id = found?.id;
        }
        if (!id) throw new Error('ledger account could not be resolved');
        cache.set(key, id);
      }
      out.push(id);
    }
    return out;
  }

  /** The key was posted before: same lines → the original id; different lines → refuse. */
  private async replay(
    tx: Tx,
    posting: Posting,
    lines: Array<{ accountId: string; debitNgwee: number; creditNgwee: number }>,
  ): Promise<PostResult> {
    const [existing] = await tx
      .select({ id: ledgerTransactions.id })
      .from(ledgerTransactions)
      .where(
        and(
          eq(ledgerTransactions.kind, posting.kind),
          eq(ledgerTransactions.refType, posting.ref.type),
          eq(ledgerTransactions.refId, posting.ref.id),
        ),
      );
    if (!existing) throw new Error('ledger transaction vanished');
    const stored = await tx
      .select({
        accountId: ledgerEntries.accountId,
        debitNgwee: ledgerEntries.debitNgwee,
        creditNgwee: ledgerEntries.creditNgwee,
      })
      .from(ledgerEntries)
      .where(eq(ledgerEntries.transactionId, existing.id));
    const fingerprint = (ls: typeof lines) =>
      ls
        .map((l) => `${l.accountId}:${l.debitNgwee}:${l.creditNgwee}`)
        .toSorted()
        .join('|');
    if (fingerprint(stored) !== fingerprint(lines)) {
      throw new LedgerConflictError(
        `${posting.kind} for ${posting.ref.type} was already posted with different lines`,
      );
    }
    return { transactionId: existing.id, created: false };
  }
}

function keyFilter(ref: AccountRef): SQL | undefined {
  const k = accountKey(ref);
  return and(
    eq(ledgerAccounts.kind, k.kind),
    sql`${ledgerAccounts.ownerId} is not distinct from ${k.ownerId}::uuid`,
    sql`${ledgerAccounts.provider} is not distinct from ${k.provider}::text`,
    sql`${ledgerAccounts.network} is not distinct from ${k.network}::text`,
  );
}

function required(id: string | undefined): string {
  if (!id) throw new Error('ledger account missing');
  return id;
}
