import { sql } from 'drizzle-orm';
import { bigint, check, index, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

/**
 * Ledger module tables (F-06). Only the ledger module reads or writes these.
 *
 * Double entry: every ledger transaction has two or more entries, and its debits equal its credits.
 * Entries and transactions are append-only. Migration 0006 enforces both in the database (triggers),
 * and the app's database role has no UPDATE/DELETE on them. Balances are always sums of entries.
 *
 * `updated_at` exists only because every table has one (CLAUDE.md); for these tables it never changes.
 */
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const LEDGER_ACCOUNT_KINDS = [
  /** Money held for a fundraiser (we owe it to the beneficiary). Credit-normal. */
  'campaign_funds',
  /** Donor tips: Fundizo's only revenue. Credit-normal. */
  'platform_tips',
  /** Charges the networks/aggregator take. Debit-normal (an expense). */
  'network_fees',
  /** Money sitting in a provider's collection wallet for one network. Debit-normal (an asset). */
  'provider_clearing',
] as const;

export const ledgerAccounts = pgTable(
  'ledger_accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind', { enum: LEDGER_ACCOUNT_KINDS }).notNull(),
    /** The campaign id for campaign_funds. Opaque here: no foreign key into another module. */
    ownerId: uuid('owner_id'),
    /** Provider (e.g. ZYNLE, FAKE) and network (MTN, AIRTEL) are separate fields (ADR 0002). */
    provider: text('provider'),
    network: text('network'),
    currency: text('currency').notNull().default('ZMW'),
    normalBalance: text('normal_balance', { enum: ['debit', 'credit'] }).notNull(),
    ...timestamps,
  },
  (t) => [
    unique('ledger_accounts_identity')
      .on(t.kind, t.ownerId, t.provider, t.network)
      .nullsNotDistinct(),
    check('ledger_accounts_currency', sql`${t.currency} = 'ZMW'`),
  ],
);

export const ledgerTransactions = pgTable(
  'ledger_transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** What happened, e.g. donation_settled. */
    kind: text('kind').notNull(),
    /** The business record this posting belongs to, e.g. ('payment_attempt', <id>). */
    refType: text('ref_type').notNull(),
    refId: text('ref_id').notNull(),
    ...timestamps,
  },
  // Idempotency: one posting per (kind, business record). A replay returns the original.
  (t) => [unique('ledger_transactions_ref').on(t.kind, t.refType, t.refId)],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    transactionId: uuid('transaction_id')
      .notNull()
      .references(() => ledgerTransactions.id, { onDelete: 'restrict' }),
    accountId: uuid('account_id')
      .notNull()
      .references(() => ledgerAccounts.id, { onDelete: 'restrict' }),
    debitNgwee: bigint('debit_ngwee', { mode: 'number' }).notNull().default(0),
    creditNgwee: bigint('credit_ngwee', { mode: 'number' }).notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index('ledger_entries_account').on(t.accountId),
    index('ledger_entries_transaction').on(t.transactionId),
    // Exactly one side, and positive.
    check(
      'ledger_entries_one_side',
      sql`(${t.debitNgwee} > 0 and ${t.creditNgwee} = 0) or (${t.creditNgwee} > 0 and ${t.debitNgwee} = 0)`,
    ),
  ],
);
