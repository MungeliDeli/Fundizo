import { Inject, Injectable } from '@nestjs/common';
import type { Photo } from '@fundizo/shared';
import { asc, inArray } from 'drizzle-orm';
import { campaignMedia, type CampaignMediaRow } from '../../db/schema/index.js';
import { DB, type Database } from '../../infra/database/database.module.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../infra/storage/object-storage.js';

export const VARIANTS = ['w1200', 'w400', 'blur'] as const;
export type Variant = (typeof VARIANTS)[number];

/** Keyed by the photo's own random id only: public URLs never reveal which campaign row it is. */
export function mediaKey(photoId: string, variant: Variant): string {
  return `photos/${photoId}/${variant}.webp`;
}

/** Reads photos and turns rows into public URLs. Shared by the campaign and photo services. */
@Injectable()
export class CampaignPhotosRepository {
  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async list(campaignId: string): Promise<Photo[]> {
    return (await this.listFor([campaignId])).get(campaignId) ?? [];
  }

  /** Photos for many campaigns at once, each list in display order (cover first). */
  async listFor(campaignIds: string[]): Promise<Map<string, Photo[]>> {
    const out = new Map<string, Photo[]>();
    if (campaignIds.length === 0) return out;
    const rows = await this.db
      .select()
      .from(campaignMedia)
      .where(inArray(campaignMedia.campaignId, campaignIds))
      .orderBy(asc(campaignMedia.sort), asc(campaignMedia.createdAt));
    for (const row of rows) {
      const list = out.get(row.campaignId) ?? [];
      list.push(this.toPhoto(row));
      out.set(row.campaignId, list);
    }
    return out;
  }

  toPhoto(row: CampaignMediaRow): Photo {
    const url = (v: Variant) => this.storage.url(mediaKey(row.id, v));
    return {
      id: row.id,
      url: url('w1200'),
      thumbUrl: url('w400'),
      blurUrl: url('blur'),
      sensitive: row.sensitive,
      width: row.width,
      height: row.height,
    };
  }
}
