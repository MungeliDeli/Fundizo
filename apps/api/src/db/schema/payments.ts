import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Payments module tables (D-01 – D-10). Only the payments module reads or writes these.
 * `campaign_id` is opaque here (no foreign key into the campaigns module's tables).
 */
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const DONATION_STATUSES = ['pending', 'successful', 'failed', 'expired', 'unknown'] as const;

export const donations = pgTable(
  'donations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id').notNull(),
    amountNgwee: bigint('amount_ngwee', { mode: 'number' }).notNull(),
    tipNgwee: bigint('tip_ngwee', { mode: 'number' }).notNull(),
    /** What the network kept, once settled (the campaign and the tip each bear their share). */
    networkFeeNgwee: bigint('network_fee_ngwee', { mode: 'number' }),
    /** Null when anonymous. Shown on the donor wall. */
    donorName: text('donor_name'),
    anonymous: boolean('anonymous').notNull(),
    message: text('message'),
    /** The donor's mobile money number (E.164). Personal data: never public, never logged in full. */
    phoneE164: text('phone_e164').notNull(),
    network: text('network', { enum: ['MTN', 'AIRTEL'] }).notNull(),
    status: text('status', { enum: DONATION_STATUSES }).notNull().default('pending'),
    /** Client-supplied key (money rule 6) and a hash of the request it came with. */
    idempotencyKey: text('idempotency_key').notNull(),
    requestHash: text('request_hash').notNull(),
    settledAt: timestamp('settled_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('donations_idempotency_key').on(t.idempotencyKey),
    index('donations_campaign_wall')
      .on(t.campaignId, t.settledAt)
      .where(sql`${t.status} = 'successful'`),
    check('donations_amount_positive', sql`${t.amountNgwee} > 0`),
    check('donations_tip_nonnegative', sql`${t.tipNgwee} >= 0`),
  ],
);

export const ATTEMPT_STATUSES = [
  'initiated',
  'pending',
  'successful',
  'failed',
  'expired',
  'unknown',
] as const;
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];

export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    /** Also the reference sent to the provider (money rule 6). */
    id: uuid('id').primaryKey().defaultRandom(),
    donationId: uuid('donation_id')
      .notNull()
      .references(() => donations.id, { onDelete: 'restrict' }),
    /** Provider (FAKE, ZYNLE) and network (MTN, AIRTEL) are separate (ADR 0002). */
    provider: text('provider', { enum: ['FAKE', 'ZYNLE'] }).notNull(),
    network: text('network', { enum: ['MTN', 'AIRTEL'] }).notNull(),
    phoneE164: text('phone_e164').notNull(),
    /** Donation + tip: what the donor approves in one prompt. */
    amountNgwee: bigint('amount_ngwee', { mode: 'number' }).notNull(),
    status: text('status', { enum: ATTEMPT_STATUSES }).notNull().default('initiated'),
    /** The client's key for the request that created this attempt (POST /donations or a retry). */
    idempotencyKey: text('idempotency_key').notNull(),
    providerRef: text('provider_ref'),
    failureReason: text('failure_reason'),
    feeNgwee: bigint('fee_ngwee', { mode: 'number' }),
    promptSentAt: timestamp('prompt_sent_at', { withTimezone: true }),
    checkCount: integer('check_count').notNull().default(0),
    lastCheckedAt: timestamp('last_checked_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index('payment_attempts_donation').on(t.donationId),
    uniqueIndex('payment_attempts_idempotency_key').on(t.idempotencyKey),
    // No double charge: at most ONE open attempt per donation. A retry is only possible once the
    // previous attempt has a final answer (failed or expired). `unknown` counts as open.
    uniqueIndex('payment_attempts_one_open')
      .on(t.donationId)
      .where(sql`${t.status} in ('initiated', 'pending', 'unknown')`),
    check('payment_attempts_amount_positive', sql`${t.amountNgwee} > 0`),
  ],
);

export type DonationRow = typeof donations.$inferSelect;
export type PaymentAttemptRow = typeof paymentAttempts.$inferSelect;
