import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './identity.js';

/**
 * Campaigns module tables (C-01 – C-07). Only the campaigns module reads or writes these.
 * Money is whole ngwee in a bigint (CLAUDE.md money rule 1); "raised" is never stored here: it will
 * always be derived from the ledger (slice 5).
 */
const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    status: text('status', { enum: ['draft', 'published'] })
      .notNull()
      .default('draft'),
    /** Public address, /f/<slug>. Set when published. */
    slug: text('slug'),
    /** Campaign type plug-in (standard; funeral and events later) and its own validated settings. */
    type: text('type').notNull().default('standard'),
    typeConfig: jsonb('type_config').notNull().default({}),
    category: text('category', {
      enum: ['medical', 'funeral', 'education', 'emergency', 'community', 'event', 'other'],
    }),
    title: text('title').notNull().default(''),
    story: jsonb('story')
      .$type<{ whatHappened: string; moneyFor: string; extra: string }>()
      .notNull()
      .default({ whatHappened: '', moneyFor: '', extra: '' }),
    goalNgwee: bigint('goal_ngwee', { mode: 'number' }),
    endDate: date('end_date'),
    province: text('province'),
    district: text('district'),
    verificationStatus: text('verification_status', { enum: ['unverified', 'verified'] })
      .notNull()
      .default('unverified'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('campaigns_slug_key').on(t.slug),
    index('campaigns_owner_idx').on(t.ownerUserId),
    check('campaigns_status_check', sql`${t.status} in ('draft', 'published')`),
    check(
      'campaigns_category_check',
      sql`${t.category} is null or ${t.category} in ('medical', 'funeral', 'education', 'emergency', 'community', 'event', 'other')`,
    ),
    check('campaigns_goal_check', sql`${t.goalNgwee} is null or ${t.goalNgwee} > 0`),
    check(
      'campaigns_verification_check',
      sql`${t.verificationStatus} in ('unverified', 'verified')`,
    ),
    check(
      'campaigns_published_check',
      sql`${t.status} = 'draft' or (${t.slug} is not null and ${t.publishedAt} is not null)`,
    ),
  ],
);

/** Who the money is for (C-02). One per campaign. The phone is private (for V-02 confirmation). */
export const campaignBeneficiaries = pgTable(
  'campaign_beneficiaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => campaigns.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['self', 'someone_else'] }).notNull(),
    name: text('name'),
    relationship: text('relationship'),
    phoneE164: text('phone_e164'),
    ...timestamps,
  },
  (t) => [
    uniqueIndex('campaign_beneficiaries_campaign_key').on(t.campaignId),
    check('campaign_beneficiaries_kind_check', sql`${t.kind} in ('self', 'someone_else')`),
    check(
      'campaign_beneficiaries_named_check',
      sql`${t.kind} = 'self' or (${t.name} is not null and ${t.relationship} is not null)`,
    ),
  ],
);

export type CampaignRow = typeof campaigns.$inferSelect;
export type CampaignBeneficiaryRow = typeof campaignBeneficiaries.$inferSelect;
