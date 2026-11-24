import { Module } from '@nestjs/common';
import { CampaignsModule } from '../campaigns/campaigns.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { FundraiserLiveHandler } from './fundraiser-live.handler.js';

/**
 * Notifications (N-*). Reacts to other modules' events and sends messages through the Mailer and
 * Messaging adapters. Templates and receipts grow here in slice 9.
 */
@Module({
  imports: [IdentityModule, CampaignsModule],
  providers: [FundraiserLiveHandler],
})
export class NotificationsModule {}
