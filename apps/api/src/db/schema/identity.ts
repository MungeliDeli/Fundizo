import { sql } from 'drizzle-orm';
import {
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
 * Identity module tables (ADR 0004). Only the identity module reads or writes these.
 * Secrets are never stored: passwords as Argon2id PHC strings, tokens and codes as HMAC hashes.
 */
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Always stored lower-cased and trimmed (normalised by the shared Email schema). */
    email: text('email').notNull(),
    emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),
    /** Null for accounts that only use Google sign-in (A-12). */
    passwordHash: text('password_hash'),
    status: text('status', { enum: ['active', 'disabled'] })
      .notNull()
      .default('active'),
    /** Profile (A-02). */
    province: text('province'),
    district: text('district'),
    language: text('language', { enum: ['en', 'bem', 'nya', 'toi'] })
      .notNull()
      .default('en'),
    /** Confirmed mobile number in E.164 (A-13). Set only after the SMS code is entered. */
    phoneE164: text('phone_e164'),
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('users_email_key').on(sql`lower(${t.email})`),
    // A number can be confirmed on only one account.
    uniqueIndex('users_phone_e164_key').on(t.phoneE164),
    check('users_status_check', sql`${t.status} in ('active', 'disabled')`),
    check('users_language_check', sql`${t.language} in ('en', 'bem', 'nya', 'toi')`),
    check('users_phone_pair_check', sql`(${t.phoneE164} is null) = (${t.phoneVerifiedAt} is null)`),
  ],
);

export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    uniqueIndex('sessions_token_hash_key').on(t.tokenHash),
    index('sessions_user_id_idx').on(t.userId),
  ],
);

/** One-time secrets: 6-digit email and phone codes, and password-reset link tokens. */
export const oneTimeTokens = pgTable(
  'one_time_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text('purpose', {
      enum: ['verify_email', 'reset_password', 'verify_phone'],
    }).notNull(),
    /** For verify_phone: the E.164 number the code was sent to. */
    target: text('target'),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    attempts: integer('attempts').notNull().default(0),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index('one_time_tokens_user_purpose_idx').on(t.userId, t.purpose),
    index('one_time_tokens_token_hash_idx').on(t.tokenHash),
    check(
      'one_time_tokens_purpose_check',
      sql`${t.purpose} in ('verify_email', 'reset_password', 'verify_phone')`,
    ),
  ],
);

/**
 * External sign-in accounts linked to a user (A-12). One Google account links to at most one
 * Fundizo user (unique provider + subject). The subject is Google's stable "sub", never the email.
 */
export const userIdentities = pgTable(
  'user_identities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    provider: text('provider', { enum: ['google'] }).notNull(),
    subject: text('subject').notNull(),
    /** The provider's email when linked, for support and audit; sign-in never matches on it. */
    email: text('email').notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('user_identities_provider_subject_key').on(t.provider, t.subject),
    uniqueIndex('user_identities_user_provider_key').on(t.userId, t.provider),
    check('user_identities_provider_check', sql`${t.provider} in ('google')`),
  ],
);

export type UserRow = typeof users.$inferSelect;
export type SessionRow = typeof sessions.$inferSelect;
export type UserIdentityRow = typeof userIdentities.$inferSelect;
