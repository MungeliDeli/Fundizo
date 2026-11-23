import { Inject, Injectable, Logger } from '@nestjs/common';
import { PHOTO_MAX, type Photo, type UpdatePhotoRequest } from '@fundizo/shared';
import { and, eq, sql } from 'drizzle-orm';
import { AppError, Errors } from '../../common/app-error.js';
import { RateLimiter } from '../../common/rate-limiter.js';
import { campaignMedia } from '../../db/schema/index.js';
import { DB, type Database } from '../../infra/database/database.module.js';
import { BadImageError, processPhoto } from '../../infra/images/image-processor.js';
import { OBJECT_STORAGE, type ObjectStorage } from '../../infra/storage/object-storage.js';
import { CampaignPhotosRepository, mediaKey, VARIANTS } from './campaign-photos.repository.js';
import { CampaignsService } from './campaigns.service.js';

const HOUR = 60 * 60;

/**
 * Adding, ordering and removing fundraiser photos (C-05). Every method first proves the campaign is
 * the session user's own draft (via CampaignsService), so nobody can touch someone else's photos.
 */
@Injectable()
export class CampaignPhotosService {
  private readonly logger = new Logger(CampaignPhotosService.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly campaigns: CampaignsService,
    private readonly repo: CampaignPhotosRepository,
    private readonly limiter: RateLimiter,
  ) {}

  async add(ownerId: string, campaignId: string, body: unknown): Promise<Photo[]> {
    await this.campaigns.requireOwnDraft(ownerId, campaignId);
    await this.limiter.consume(`photos:upload:${ownerId}`, 60, HOUR);
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new AppError('bad_image', 415, 'Upload a JPEG, PNG or WebP photo.');
    }
    const [{ count } = { count: 0 }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(campaignMedia)
      .where(eq(campaignMedia.campaignId, campaignId));
    if (count >= PHOTO_MAX) {
      throw new AppError(
        'too_many_photos',
        409,
        `A fundraiser can have up to ${PHOTO_MAX} photos. Remove one first.`,
      );
    }

    let processed;
    try {
      processed = await processPhoto(body);
    } catch (err) {
      if (err instanceof BadImageError) throw new AppError('bad_image', 422, err.message);
      throw err;
    }

    const photoId = crypto.randomUUID();
    const keys = VARIANTS.map((v) => mediaKey(photoId, v));
    await Promise.all([
      this.storage.put(mediaKey(photoId, 'w1200'), processed.w1200, 'image/webp'),
      this.storage.put(mediaKey(photoId, 'w400'), processed.w400, 'image/webp'),
      this.storage.put(mediaKey(photoId, 'blur'), processed.blur, 'image/webp'),
    ]);
    try {
      await this.db.insert(campaignMedia).values({
        id: photoId,
        campaignId,
        width: processed.width,
        height: processed.height,
        sort: sql`coalesce((select max(${campaignMedia.sort}) + 1 from ${campaignMedia} where ${campaignMedia.campaignId} = ${campaignId}), 0)`,
      });
    } catch (err) {
      await this.storage.delete(keys).catch(() => undefined);
      throw err;
    }
    return this.repo.list(campaignId);
  }

  async update(
    ownerId: string,
    campaignId: string,
    photoId: string,
    change: UpdatePhotoRequest,
  ): Promise<Photo[]> {
    await this.campaigns.requireOwnDraft(ownerId, campaignId);
    await this.requirePhoto(campaignId, photoId);
    if (change.sensitive !== undefined) {
      await this.db
        .update(campaignMedia)
        .set({ sensitive: change.sensitive })
        .where(eq(campaignMedia.id, photoId));
    }
    if (change.cover) {
      // Move it before everything else: the lowest sort is the cover.
      await this.db
        .update(campaignMedia)
        .set({
          sort: sql`(select coalesce(min(${campaignMedia.sort}), 0) - 1 from ${campaignMedia} where ${campaignMedia.campaignId} = ${campaignId})`,
        })
        .where(eq(campaignMedia.id, photoId));
    }
    return this.repo.list(campaignId);
  }

  async remove(ownerId: string, campaignId: string, photoId: string): Promise<Photo[]> {
    await this.campaigns.requireOwnDraft(ownerId, campaignId);
    await this.requirePhoto(campaignId, photoId);
    await this.db.delete(campaignMedia).where(eq(campaignMedia.id, photoId));
    await this.storage
      .delete(VARIANTS.map((v) => mediaKey(photoId, v)))
      .catch((err: unknown) =>
        this.logger.warn(
          { reason: err instanceof Error ? err.message : String(err) },
          'photo files not removed',
        ),
      );
    return this.repo.list(campaignId);
  }

  private async requirePhoto(campaignId: string, photoId: string) {
    const [row] = await this.db
      .select({ id: campaignMedia.id })
      .from(campaignMedia)
      .where(and(eq(campaignMedia.id, photoId), eq(campaignMedia.campaignId, campaignId)))
      .limit(1);
    if (!row) throw Errors.notFound();
  }
}
