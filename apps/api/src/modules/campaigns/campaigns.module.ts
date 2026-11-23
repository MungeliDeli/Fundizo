import { Module } from '@nestjs/common';
import { RateLimiter } from '../../common/rate-limiter.js';
import { IdentityModule } from '../identity/identity.module.js';
import { CampaignsController, PublicCampaignsController } from './campaigns.controller.js';
import { CampaignsService } from './campaigns.service.js';

/** Campaigns (C-01 – C-07). Uses identity only through its public exports (AuthGuard, UserDirectory). */
@Module({
  imports: [IdentityModule],
  controllers: [CampaignsController, PublicCampaignsController],
  providers: [CampaignsService, RateLimiter],
})
export class CampaignsModule {}
