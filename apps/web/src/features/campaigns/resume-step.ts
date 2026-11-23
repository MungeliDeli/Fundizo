import { type OwnCampaign, STORY_MIN } from '@fundizo/shared';
import type { WizardStep } from './wizard/steps';

/** Where to pick a draft back up: the first step that isn't finished yet. */
export function resumeStep(c: OwnCampaign): WizardStep {
  if (!c.category) return 'category';
  if (c.category !== 'funeral' && c.goalNgwee === null) return 'goal';
  if (
    c.title.trim().length < 10 ||
    c.story.whatHappened.trim().length < STORY_MIN ||
    c.story.moneyFor.trim().length < 10
  )
    return 'story';
  if (c.photos.length === 0) return 'photos';
  return 'review';
}
