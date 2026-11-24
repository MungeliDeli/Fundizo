import { z } from 'zod';
import { Ngwee, kwachaToNgwee } from './money.js';
import { detectNetwork, normaliseZambianMobile } from './phone.js';

/**
 * Donations (D-01 – D-10, U-04). Product rules agreed 2026-11-24: minimum K5, 10% suggested tip,
 * whole-kwacha amounts. Money stays integer ngwee everywhere (CLAUDE.md money rule 1).
 */
export const DONATION_MIN_NGWEE = kwachaToNgwee(5);
export const DONATION_MAX_NGWEE = kwachaToNgwee(50_000);
export const TIP_MAX_NGWEE = kwachaToNgwee(5_000);
export const QUICK_AMOUNTS_NGWEE = [50, 100, 200, 500].map(kwachaToNgwee);
export const TIP_PERCENTS = [0, 5, 10, 15] as const;
export const DEFAULT_TIP_PERCENT = 10;
export const DONOR_NAME_MAX = 60;
export const DONATION_MESSAGE_MAX = 280;
/** How long a payment prompt stays open on the donor's phone. */
export const PROMPT_SECONDS = 120;

/** Header carrying the idempotency key on POST /donations and retries (money rule 6). */
export const IDEMPOTENCY_HEADER = 'idempotency-key';
/** Header proving the caller started this donation (guests have no account). */
export const DONATION_TOKEN_HEADER = 'x-donation-token';

/** A percentage tip, rounded to whole kwacha (half up), with integer maths only. */
export function suggestedTip(amountNgwee: number, percent: number): number {
  return Math.floor((amountNgwee * percent + 5_000) / 10_000) * 100;
}

export const PayNetwork = z.enum(['MTN', 'AIRTEL']);
export type PayNetwork = z.infer<typeof PayNetwork>;

const WholeKwacha = Ngwee.refine((v) => v % 100 === 0, { message: 'Use whole kwacha.' });

/** MTN or Airtel only for now; Zamtel and cards come later. */
export const DonorPhone = z
  .string()
  .max(20)
  .superRefine((v, ctx) => {
    if (detectNetwork(v) === 'ZAMTEL') {
      ctx.addIssue({
        code: 'custom',
        message: 'Zamtel isn’t supported yet. Use an MTN or Airtel number.',
      });
    } else if (!normaliseZambianMobile(v)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Enter an MTN or Airtel number, like 096 123 4567.',
      });
    }
  });

export const CreateDonationRequest = z
  .strictObject({
    campaignSlug: z.string().min(1).max(120),
    amountNgwee: WholeKwacha.min(DONATION_MIN_NGWEE, { message: 'The smallest gift is K5.' }).max(
      DONATION_MAX_NGWEE,
      { message: 'The largest gift is K50,000.' },
    ),
    tipNgwee: WholeKwacha.max(TIP_MAX_NGWEE, { message: 'The largest tip is K5,000.' }),
    phone: DonorPhone,
    anonymous: z.boolean(),
    donorName: z.string().trim().max(DONOR_NAME_MAX).optional(),
    message: z.string().trim().max(DONATION_MESSAGE_MAX).optional(),
  })
  .refine((d) => d.anonymous || (d.donorName ?? '').length > 0, {
    path: ['donorName'],
    message: 'Add your name, or give anonymously.',
  });
export type CreateDonationRequest = z.infer<typeof CreateDonationRequest>;

/** Try again (after a failed or expired prompt), optionally with another number. */
export const RetryDonationRequest = z.strictObject({ phone: DonorPhone.optional() });
export type RetryDonationRequest = z.infer<typeof RetryDonationRequest>;

/**
 * What the donor sees. `unknown` is never success: the network hasn't given a final answer, and
 * the donor is told not to pay again (money rule 8).
 */
export const DonationStatus = z.enum(['pending', 'successful', 'failed', 'expired', 'unknown']);
export type DonationStatus = z.infer<typeof DonationStatus>;

export const FailureReason = z.enum([
  'insufficient_funds',
  'wrong_pin',
  'cancelled',
  'declined',
  'not_sent',
]);
export type FailureReason = z.infer<typeof FailureReason>;

export const FAILURE_TEXT: Record<FailureReason, string> = {
  insufficient_funds: 'There wasn’t enough money in the wallet.',
  wrong_pin: 'The PIN was wrong.',
  cancelled: 'The payment was cancelled on the phone.',
  declined: 'The network declined the payment.',
  not_sent: 'We couldn’t send the prompt to that number.',
};

export const DonationView = z.object({
  id: z.uuid(),
  /** Short reference for support calls, e.g. FZ-7Q4K2B. */
  reference: z.string(),
  status: DonationStatus,
  failureReason: FailureReason.nullable(),
  amountNgwee: Ngwee,
  tipNgwee: Ngwee,
  totalNgwee: Ngwee,
  network: PayNetwork,
  /** The donor's own number in local format (only ever shown to the person holding the token). */
  phone: z.string(),
  donorName: z.string().nullable(),
  anonymous: z.boolean(),
  campaign: z.object({ slug: z.string(), title: z.string() }),
  /** False until the provider has actually been asked to send the prompt (a moment after Pay). */
  promptSent: z.boolean(),
  /** When the current prompt expires (ISO). */
  promptExpiresAt: z.string(),
  /** True when a new prompt may be sent (the last one failed or expired). */
  canRetry: z.boolean(),
});
export type DonationView = z.infer<typeof DonationView>;

export const DonationResponse = z.object({ donation: DonationView });
export const CreateDonationResponse = z.object({
  donation: DonationView,
  /** Keep on this device; send it back in X-Donation-Token to read the status. */
  accessToken: z.string(),
});

/** The donor wall (U-04): names only if the donor chose to show one. Never phone numbers. */
export const PublicDonation = z.object({
  name: z.string().nullable(),
  amountNgwee: Ngwee,
  message: z.string().nullable(),
  createdAt: z.string(),
});
export type PublicDonation = z.infer<typeof PublicDonation>;
export const PublicDonationsResponse = z.object({
  donorCount: z.number().int().nonnegative(),
  donations: z.array(PublicDonation),
});
export type PublicDonationsResponse = z.infer<typeof PublicDonationsResponse>;
