import { z } from 'zod';
import { defineEvent } from '../../jobs/events.js';

/** Events the campaigns module publishes (through the outbox). Ids only, never personal data. */
export const CampaignPublished = defineEvent(
  'campaign.published',
  z.strictObject({ campaignId: z.uuid() }),
);
