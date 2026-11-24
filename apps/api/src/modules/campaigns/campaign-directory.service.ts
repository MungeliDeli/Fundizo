import { Inject, Injectable } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { campaigns } from '../../db/schema/index.js';
import { DB, type Database } from '../../infra/database/database.module.js';

/** What other modules may know about a campaign. No beneficiary details, no phone numbers. */
export interface CampaignSummary {
  id: string;
  ownerUserId: string;
  status: 'draft' | 'published';
  title: string;
  slug: string | null;
}

/** The campaigns module's read-only public interface (like identity's UserDirectory). */
@Injectable()
export class CampaignDirectory {
  constructor(@Inject(DB) private readonly db: Database) {}

  async get(id: string): Promise<CampaignSummary | null> {
    const [c] = await this.db
      .select({
        id: campaigns.id,
        ownerUserId: campaigns.ownerUserId,
        status: campaigns.status,
        title: campaigns.title,
        slug: campaigns.slug,
      })
      .from(campaigns)
      .where(eq(campaigns.id, id));
    return c ?? null;
  }

  /** Newest published campaigns, for internal tools (the dev ledger page). */
  async listPublished(limit = 20): Promise<CampaignSummary[]> {
    return this.db
      .select({
        id: campaigns.id,
        ownerUserId: campaigns.ownerUserId,
        status: campaigns.status,
        title: campaigns.title,
        slug: campaigns.slug,
      })
      .from(campaigns)
      .where(eq(campaigns.status, 'published'))
      .orderBy(desc(campaigns.publishedAt))
      .limit(limit);
  }

  async getPublishedBySlug(slug: string): Promise<CampaignSummary | null> {
    const [c] = await this.db
      .select({
        id: campaigns.id,
        ownerUserId: campaigns.ownerUserId,
        status: campaigns.status,
        title: campaigns.title,
        slug: campaigns.slug,
      })
      .from(campaigns)
      .where(eq(campaigns.slug, slug));
    return c?.status === 'published' ? c : null;
  }
}
