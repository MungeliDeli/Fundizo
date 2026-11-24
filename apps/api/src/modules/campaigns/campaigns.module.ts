import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from '@fundizo/shared';
import express from 'express';
import { RateLimiter } from '../../common/rate-limiter.js';
import { IdentityModule } from '../identity/identity.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { CampaignPhotosRepository } from './campaign-photos.repository.js';
import { CampaignPhotosService } from './campaign-photos.service.js';
import { CampaignsController, PublicCampaignsController } from './campaigns.controller.js';
import { CampaignDirectory } from './campaign-directory.service.js';
import { CampaignsService } from './campaigns.service.js';

/**
 * Campaigns (C-01 – C-07) and their photos (C-05). Uses identity and the ledger only through their
 * public exports; publishes CampaignPublished through the outbox.
 */
@Module({
  imports: [IdentityModule, LedgerModule],
  controllers: [CampaignsController, PublicCampaignsController],
  providers: [
    CampaignsService,
    CampaignDirectory,
    CampaignPhotosService,
    CampaignPhotosRepository,
    RateLimiter,
  ],
  // Public interface: read-only summaries for other modules (notifications). Never the tables.
  exports: [CampaignDirectory],
})
export class CampaignsModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Photo uploads arrive as the raw request body, only on this route, only for image types,
    // capped before anything is read into memory.
    consumer
      .apply(express.raw({ type: [...PHOTO_TYPES], limit: PHOTO_MAX_BYTES }))
      .forRoutes({ path: 'campaigns/:id/photos', method: RequestMethod.POST });
  }
}
