import { z } from 'zod';
import { defineEvent } from '../../jobs/events.js';

/** Events the payments module publishes (through the outbox). Ids only, never phone numbers. */

/** A payment attempt was recorded; the worker sends the prompt (never inside the request). */
export const PaymentAttemptCreated = defineEvent(
  'payment.attempt_created',
  z.strictObject({ attemptId: z.uuid() }),
);

/** The provider confirmed a donation and the ledger recorded it (receipts arrive in slice 9). */
export const DonationConfirmed = defineEvent(
  'donation.confirmed',
  z.strictObject({ donationId: z.uuid(), campaignId: z.uuid() }),
);
