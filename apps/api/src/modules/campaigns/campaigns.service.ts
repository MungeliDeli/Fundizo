import { Inject, Injectable } from '@nestjs/common';
import {
  type Beneficiary,
  type CampaignDraftUpdate,
  type OwnCampaign,
  type PublicCampaign,
  publishProblems,
} from '@fundizo/shared';
import { and, desc, eq } from 'drizzle-orm';
import { AppError, Errors } from '../../common/app-error.js';
import { RateLimiter } from '../../common/rate-limiter.js';
import {
  campaignBeneficiaries,
  campaigns,
  type CampaignBeneficiaryRow,
  type CampaignRow,
} from '../../db/schema/index.js';
import { DB, type Database } from '../../infra/database/database.module.js';
import { UserDirectory } from '../identity/user-directory.service.js';
import { campaignType } from './campaign-types.js';
import { makeSlug } from './slugs.js';

const DAY = 24 * 60 * 60;

/**
 * Creating, editing and publishing fundraisers (C-01 – C-07).
 * Object-level authorisation: every owner method loads the campaign WITH the owner id, so another
 * person's campaign is simply "not found" (never "forbidden", which would reveal it exists).
 */
@Injectable()
export class CampaignsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly users: UserDirectory,
    private readonly limiter: RateLimiter,
  ) {}

  async create(ownerId: string, beneficiary: Beneficiary): Promise<OwnCampaign> {
    await this.limiter.consume(`campaign:create:${ownerId}`, 20, DAY);
    const owner = await this.users.get(ownerId);
    if (!owner) throw Errors.unauthenticated();
    return this.db.transaction(async (tx) => {
      const [campaign] = await tx
        .insert(campaigns)
        // Where the organiser lives is a sensible default for where the need is.
        .values({ ownerUserId: ownerId, province: owner.province, district: owner.district })
        .returning();
      if (!campaign) throw new Error('insert failed');
      const [row] = await tx
        .insert(campaignBeneficiaries)
        .values({ campaignId: campaign.id, ...beneficiaryColumns(beneficiary) })
        .returning();
      if (!row) throw new Error('insert failed');
      return toOwn(campaign, row);
    });
  }

  async listOwn(ownerId: string): Promise<OwnCampaign[]> {
    const rows = await this.db
      .select({ campaign: campaigns, beneficiary: campaignBeneficiaries })
      .from(campaigns)
      .innerJoin(campaignBeneficiaries, eq(campaignBeneficiaries.campaignId, campaigns.id))
      .where(eq(campaigns.ownerUserId, ownerId))
      .orderBy(desc(campaigns.updatedAt));
    return rows.map((r) => toOwn(r.campaign, r.beneficiary));
  }

  async getOwn(ownerId: string, id: string): Promise<OwnCampaign> {
    const { campaign, beneficiary } = await this.loadOwn(ownerId, id);
    return toOwn(campaign, beneficiary);
  }

  /** Autosave from the wizard. Drafts only for now: editing a live fundraiser comes with re-verification (V-07). */
  async update(ownerId: string, id: string, patch: CampaignDraftUpdate): Promise<OwnCampaign> {
    const { campaign } = await this.loadOwn(ownerId, id);
    if (campaign.status !== 'draft') {
      throw new AppError(
        'validation_failed',
        409,
        'This fundraiser is live. Editing a live fundraiser comes soon.',
      );
    }
    await this.db.transaction(async (tx) => {
      const { beneficiary, ...fields } = patch;
      if (Object.keys(fields).length > 0) {
        await tx.update(campaigns).set(fields).where(eq(campaigns.id, id));
      } else {
        await tx.update(campaigns).set({ updatedAt: new Date() }).where(eq(campaigns.id, id));
      }
      if (beneficiary) {
        await tx
          .update(campaignBeneficiaries)
          .set(beneficiaryColumns(beneficiary))
          .where(eq(campaignBeneficiaries.campaignId, id));
      }
    });
    return this.getOwn(ownerId, id);
  }

  /**
   * Publish (C-07): re-checks everything on the server, including that the organiser has confirmed
   * their email and phone (verification level 1). Live immediately; verification for withdrawals
   * happens while it raises (V-01).
   */
  async publish(ownerId: string, id: string): Promise<OwnCampaign> {
    const { campaign, beneficiary } = await this.loadOwn(ownerId, id);
    if (campaign.status === 'published') return toOwn(campaign, beneficiary);
    const owner = await this.users.get(ownerId);
    if (!owner) throw Errors.unauthenticated();

    const own = toOwn(campaign, beneficiary);
    const problems = publishProblems(own, {
      emailVerified: owner.emailVerified,
      phoneVerified: owner.phoneVerified,
    });
    const type = campaignType(campaign.type);
    type.config.parse(campaign.typeConfig);
    if (problems.length > 0) {
      const fields: Record<string, string> = {};
      for (const p of problems) fields[p.step] ??= p.message;
      throw Errors.notPublishable(fields);
    }

    // A clash on the random ending is very unlikely; retry a few times with a new one.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [published] = await this.db
          .update(campaigns)
          .set({ status: 'published', slug: makeSlug(campaign.title), publishedAt: new Date() })
          .where(and(eq(campaigns.id, id), eq(campaigns.status, 'draft')))
          .returning();
        if (published) return toOwn(published, beneficiary);
        return this.getOwn(ownerId, id); // published meanwhile (double click)
      } catch (err) {
        if (!isUniqueViolation(err)) throw err;
      }
    }
    throw new Error('Could not create a unique address');
  }

  /** The public page. Published only; no phone numbers or emails, ever. */
  async getPublic(slug: string): Promise<PublicCampaign> {
    const [row] = await this.db
      .select({ campaign: campaigns, beneficiary: campaignBeneficiaries })
      .from(campaigns)
      .innerJoin(campaignBeneficiaries, eq(campaignBeneficiaries.campaignId, campaigns.id))
      .where(and(eq(campaigns.slug, slug), eq(campaigns.status, 'published')))
      .limit(1);
    if (!row?.campaign.publishedAt || !row.campaign.slug || !row.campaign.category)
      throw Errors.notFound();
    const owner = await this.users.get(row.campaign.ownerUserId);
    if (!owner) throw Errors.notFound();
    const c = row.campaign;
    const b = row.beneficiary;
    return {
      slug: row.campaign.slug,
      title: c.title,
      category: row.campaign.category,
      story: c.story,
      goalNgwee: c.goalNgwee,
      // Derived from the ledger once donations exist (slices 5–6). Never stored on the campaign.
      raisedNgwee: 0,
      donorCount: 0,
      endDate: c.endDate,
      province: c.province,
      district: c.district,
      organiser: { firstName: owner.firstName, lastName: owner.lastName },
      beneficiary:
        b.kind === 'someone_else' && b.name && b.relationship
          ? { name: b.name, relationship: b.relationship }
          : null,
      verified: c.verificationStatus === 'verified',
      publishedAt: row.campaign.publishedAt.toISOString(),
    };
  }

  private async loadOwn(
    ownerId: string,
    id: string,
  ): Promise<{ campaign: CampaignRow; beneficiary: CampaignBeneficiaryRow }> {
    const [row] = await this.db
      .select({ campaign: campaigns, beneficiary: campaignBeneficiaries })
      .from(campaigns)
      .innerJoin(campaignBeneficiaries, eq(campaignBeneficiaries.campaignId, campaigns.id))
      .where(and(eq(campaigns.id, id), eq(campaigns.ownerUserId, ownerId)))
      .limit(1);
    if (!row) throw Errors.notFound();
    return row;
  }
}

function beneficiaryColumns(b: Beneficiary) {
  return b.kind === 'self'
    ? { kind: 'self' as const, name: null, relationship: null, phoneE164: null }
    : {
        kind: 'someone_else' as const,
        name: b.name,
        relationship: b.relationship,
        phoneE164: b.phone,
      };
}

function toOwn(c: CampaignRow, b: CampaignBeneficiaryRow): OwnCampaign {
  return {
    id: c.id,
    status: c.status,
    slug: c.slug,
    beneficiary:
      b.kind === 'self'
        ? { kind: 'self' }
        : {
            kind: 'someone_else',
            name: b.name ?? '',
            relationship: b.relationship ?? '',
            phone: b.phoneE164,
          },
    category: c.category,
    goalNgwee: c.goalNgwee,
    endDate: c.endDate,
    title: c.title,
    story: c.story,
    province: c.province,
    district: c.district,
    publishedAt: c.publishedAt?.toISOString() ?? null,
    updatedAt: c.updatedAt.toISOString(),
  };
}

function isUniqueViolation(err: unknown): boolean {
  const cause = err instanceof Error && 'cause' in err ? err.cause : err;
  return typeof cause === 'object' && cause !== null && 'code' in cause && cause.code === '23505';
}
