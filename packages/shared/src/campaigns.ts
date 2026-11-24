import { z } from 'zod';
import { Ngwee, kwachaToNgwee } from './money.js';
import { NAME_MAX } from './auth.js';
import { DISTRICT_MAX, PhoneNumber, Province } from './profile.js';

/** Categories (C-03). Each one later decides which evidence verification asks for (V-03). */
export const CAMPAIGN_CATEGORIES = [
  'medical',
  'funeral',
  'education',
  'emergency',
  'community',
  'event',
  'other',
] as const;
export const CampaignCategory = z.enum(CAMPAIGN_CATEGORIES);
export type CampaignCategory = z.infer<typeof CampaignCategory>;

export const CATEGORY_INFO: Record<CampaignCategory, { label: string; hint: string }> = {
  medical: { label: 'Medical', hint: 'Hospital bills, referrals, medicine' },
  funeral: { label: 'Funeral', hint: 'Burial costs, support for the family' },
  education: { label: 'Education', hint: 'School and university fees' },
  emergency: { label: 'Emergency', hint: 'Fire, accident, flood' },
  community: { label: 'Community', hint: 'Borehole, classroom, church roof' },
  event: { label: 'Event', hint: 'Wedding, kitchen party' },
  other: { label: 'Something else', hint: 'Tell us in your story' },
};

export const CAMPAIGN_TITLE_MAX = 60;
export const STORY_MIN = 40;
export const STORY_PART_MAX = 3000;
/** Goal limits (C-06). Placeholders until real numbers are decided. Funerals may skip the goal. */
export const GOAL_MIN = kwachaToNgwee(100);
export const GOAL_MAX = kwachaToNgwee(10_000_000);

/** Photos (C-05). The first photo is the cover. */
export const PHOTO_MAX = 10;
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * A processed photo: re-encoded on the server (WebP, location data removed). `blurUrl` is always
 * available; pages show it instead of the photo when `sensitive` is set (graphic medical images).
 */
export const Photo = z.object({
  id: z.uuid(),
  url: z.string(),
  thumbUrl: z.string(),
  blurUrl: z.string(),
  sensitive: z.boolean(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type Photo = z.infer<typeof Photo>;

/** PATCH /campaigns/:id/photos/:photoId: mark as sensitive, or make it the cover. */
export const UpdatePhotoRequest = z
  .object({ sensitive: z.boolean(), cover: z.literal(true) })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change.' });
export type UpdatePhotoRequest = z.infer<typeof UpdatePhotoRequest>;

export const PhotoListResponse = z.object({ photos: z.array(Photo) });

export const Beneficiary = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('self') }).strict(),
  z
    .object({
      kind: z.literal('someone_else'),
      name: z
        .string()
        .trim()
        .min(1, 'Enter their full name.')
        .max(NAME_MAX * 2, 'That name is too long.'),
      relationship: z
        .string()
        .trim()
        .min(1, 'Say how you know them, e.g. mother or friend.')
        .max(40, 'Keep it short.'),
      /** For the beneficiary's SMS confirmation later (V-02). Never shown publicly. */
      phone: PhoneNumber.nullable(),
    })
    .strict(),
]);
export type Beneficiary = z.infer<typeof Beneficiary>;

export const Story = z
  .object({
    whatHappened: z.string().trim().max(STORY_PART_MAX),
    moneyFor: z.string().trim().max(STORY_PART_MAX),
    extra: z.string().trim().max(STORY_PART_MAX),
  })
  .strict();
export type Story = z.infer<typeof Story>;

/** Goal as ngwee, within limits. */
const Goal = Ngwee.refine((v) => v >= GOAL_MIN, { message: 'The smallest goal is K100.' }).refine(
  (v) => v <= GOAL_MAX,
  {
    message: 'That goal is too large. Contact us for very large fundraisers.',
  },
);

/** An ISO date (YYYY-MM-DD) for the optional end date. */
const EndDate = z.iso.date({ message: 'Choose a valid date.' });

/** Autosave of a draft: every field optional; each wizard step sends what it owns. */
export const CampaignDraftUpdate = z
  .object({
    beneficiary: Beneficiary,
    category: CampaignCategory,
    goalNgwee: Goal.nullable(),
    endDate: EndDate.nullable(),
    title: z
      .string()
      .trim()
      .max(CAMPAIGN_TITLE_MAX, `Keep the title to ${CAMPAIGN_TITLE_MAX} characters.`),
    story: Story,
    province: Province.nullable(),
    district: z.string().trim().max(DISTRICT_MAX).nullable(),
  })
  .partial()
  .strict();
export type CampaignDraftUpdate = z.infer<typeof CampaignDraftUpdate>;

/** Start a draft (step 1: who is it for). */
export const CreateCampaignRequest = z.object({ beneficiary: Beneficiary }).strict();
export type CreateCampaignRequest = z.infer<typeof CreateCampaignRequest>;

export const CampaignStatus = z.enum(['draft', 'published']);
export type CampaignStatus = z.infer<typeof CampaignStatus>;

/** The organiser's own view of a campaign (drafts included). Contains the beneficiary phone: owner only. */
export const OwnCampaign = z.object({
  id: z.uuid(),
  status: CampaignStatus,
  slug: z.string().nullable(),
  beneficiary: Beneficiary,
  category: CampaignCategory.nullable(),
  goalNgwee: Ngwee.nullable(),
  endDate: z.string().nullable(),
  title: z.string(),
  story: Story,
  province: z.string().nullable(),
  district: z.string().nullable(),
  publishedAt: z.iso.datetime().nullable(),
  updatedAt: z.iso.datetime(),
  /** In display order; the first is the cover. */
  photos: z.array(Photo),
});
export type OwnCampaign = z.infer<typeof OwnCampaign>;

export const OwnCampaignResponse = z.object({ campaign: OwnCampaign });
export const OwnCampaignList = z.object({ campaigns: z.array(OwnCampaign) });

/** Why a draft can't be published yet, keyed by wizard step, so the review screen can link to it. */
export const PublishProblem = z.object({
  step: z.enum(['who', 'category', 'goal', 'story', 'photos', 'account']),
  message: z.string(),
});
export type PublishProblem = z.infer<typeof PublishProblem>;

/** What publishing requires (C-07). Returns the problems, empty when ready. */
export function publishProblems(
  c: Pick<OwnCampaign, 'category' | 'goalNgwee' | 'title' | 'story'> & { photos: unknown[] },
  organiser: { emailVerified: boolean; phoneVerified: boolean },
): PublishProblem[] {
  const problems: PublishProblem[] = [];
  if (!c.category)
    problems.push({ step: 'category', message: 'Choose what the fundraiser is for.' });
  if (c.category !== 'funeral' && c.goalNgwee === null)
    problems.push({ step: 'goal', message: 'Set a goal.' });
  if (c.title.trim().length < 10)
    problems.push({ step: 'story', message: 'Give it a title of at least 10 characters.' });
  if (c.story.whatHappened.trim().length < STORY_MIN)
    problems.push({
      step: 'story',
      message: `Tell people what happened (at least ${STORY_MIN} characters).`,
    });
  if (c.story.moneyFor.trim().length < 10)
    problems.push({ step: 'story', message: 'Say what the money will pay for.' });
  if (c.photos.length === 0) problems.push({ step: 'photos', message: 'Add a cover photo.' });
  if (!organiser.emailVerified || !organiser.phoneVerified)
    problems.push({
      step: 'account',
      message: 'Confirm your phone number on your profile before publishing.',
    });
  return problems;
}

/** The public page (C-07). Deliberately has no field for anyone's phone or email. */
export const PublicCampaign = z.object({
  slug: z.string(),
  title: z.string(),
  category: CampaignCategory,
  story: Story,
  goalNgwee: Ngwee.nullable(),
  /** Always derived from the ledger. The donor count lives with donations (PublicDonationsResponse). */
  raisedNgwee: Ngwee,
  endDate: z.string().nullable(),
  province: z.string().nullable(),
  district: z.string().nullable(),
  organiser: z.object({ firstName: z.string(), lastName: z.string() }),
  /** Null when organisers raise for themselves. */
  beneficiary: z.object({ name: z.string(), relationship: z.string() }).nullable(),
  verified: z.boolean(),
  publishedAt: z.iso.datetime(),
  /** In display order; the first is the cover. Empty for fundraisers published before photos existed. */
  photos: z.array(Photo),
});
export type PublicCampaign = z.infer<typeof PublicCampaign>;
export const PublicCampaignResponse = z.object({ campaign: PublicCampaign });
