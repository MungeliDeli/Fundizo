import { z } from 'zod';

/**
 * Campaign types are plug-ins (CLAUDE.md): each defines its own settings schema, stored in
 * campaigns.type_config, so a new fundraising model never needs a database migration.
 * Only "standard" exists today; "funeral" (C-09) and "event" (C-12) come later.
 */
export interface CampaignType<C extends z.ZodType = z.ZodType> {
  id: string;
  config: C;
  /** Whether a goal is required to publish. */
  requiresGoal: boolean;
}

const standard: CampaignType = {
  id: 'standard',
  config: z.object({}).strict(),
  requiresGoal: true,
};

export const CAMPAIGN_TYPES: Record<string, CampaignType> = { standard };

export function campaignType(id: string): CampaignType {
  const type = CAMPAIGN_TYPES[id];
  if (!type) throw new Error(`Unknown campaign type: ${id}`);
  return type;
}
