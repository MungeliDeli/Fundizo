import { type MiddlewareConsumer, Module, type NestModule, RequestMethod } from '@nestjs/common';
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from '@fundizo/shared';
import express from 'express';
import { RateLimiter } from '../../common/rate-limiter.js';
import { IdentityModule } from '../identity/identity.module.js';
import { CampaignPhotosRepository } from './campaign-photos.repository.js';
import { CampaignPhotosService } from './campaign-photos.service.js';
import { CampaignsController, PublicCampaignsController } from './campaigns.controller.js';
import { CampaignsService } from './campaigns.service.js';

/** Campaigns (C-01 – C-07) and their photos (C-05). Uses identity only through its public exports. */
@Module({
  imports: [IdentityModule],
  controllers: [CampaignsController, PublicCampaignsController],
  providers: [CampaignsService, CampaignPhotosService, CampaignPhotosRepository, RateLimiter],
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
