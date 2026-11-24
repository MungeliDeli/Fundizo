import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../../config/env.js';
import { MAILER, type Mailer } from '../../infra/mail/mailer.js';
import { fundraiserLiveMessage } from '../../infra/mail/templates.js';
import { REDIS, ensureConnected } from '../../infra/redis/redis.module.js';
import { EventHandlers } from '../../jobs/event-handlers.js';
import type { DomainEvent } from '../../jobs/events.js';
import { CampaignDirectory } from '../campaigns/campaign-directory.service.js';
import { CampaignPublished } from '../campaigns/events.js';
import { UserContacts } from '../identity/user-contacts.service.js';

export const FUNDRAISER_LIVE_HANDLER = 'notifications.fundraiser-live-email';
const SENT_TTL = 30 * 24 * 3600;

/**
 * CampaignPublished → "Your fundraiser is live" email to the organiser, sent by the worker, never
 * inside the publish request. Delivery is at least once; a "sent" marker per event stops a retry
 * after success from emailing twice.
 */
@Injectable()
export class FundraiserLiveHandler implements OnModuleInit {
  constructor(
    private readonly handlers: EventHandlers,
    private readonly campaigns: CampaignDirectory,
    private readonly contacts: UserContacts,
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
  ) {}

  onModuleInit() {
    this.handlers.on(CampaignPublished, FUNDRAISER_LIVE_HANDLER, (e) => this.handle(e));
  }

  async handle(event: DomainEvent<{ campaignId: string }>): Promise<void> {
    await ensureConnected(this.redis);
    const marker = `notif:sent:${event.id}:${FUNDRAISER_LIVE_HANDLER}`;
    if (await this.redis.exists(marker)) return;

    const campaign = await this.campaigns.get(event.payload.campaignId);
    if (!campaign?.slug || campaign.status !== 'published') return;
    const to = await this.contacts.verifiedEmail(campaign.ownerUserId);
    if (!to) return;

    const link = new URL(`/f/${campaign.slug}`, this.env.WEB_BASE_URL).toString();
    await this.mailer.send(
      fundraiserLiveMessage(
        { email: to.email, name: to.firstName },
        to.firstName,
        campaign.title,
        link,
      ),
    );
    await this.redis.set(marker, '1', 'EX', SENT_TTL);
  }
}
