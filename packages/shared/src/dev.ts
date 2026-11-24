import { z } from 'zod';
import { Ngwee, kwachaToNgwee } from './money.js';

/**
 * Development-only contracts (/dev/*). These routes don't exist in production.
 */

/** Posts a pretend donation straight to the ledger, to see totals move before payments exist. */
export const DevTestDonationRequest = z.strictObject({
  campaignSlug: z.string().min(1).max(120),
  amountNgwee: Ngwee.min(kwachaToNgwee(1)).max(kwachaToNgwee(100_000)),
  tipNgwee: Ngwee.max(kwachaToNgwee(10_000)),
  network: z.enum(['MTN', 'AIRTEL']),
});
export type DevTestDonationRequest = z.infer<typeof DevTestDonationRequest>;

const SignedNgwee = z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER);

export const DevLedgerResponse = z.object({
  totals: z.object({
    debitsNgwee: Ngwee,
    creditsNgwee: Ngwee,
    transactionCount: z.number().int().nonnegative(),
    balanced: z.boolean(),
  }),
  accounts: z.array(
    z.object({
      kind: z.string(),
      label: z.string(),
      normal: z.enum(['debit', 'credit']),
      balanceNgwee: SignedNgwee,
    }),
  ),
  recent: z.array(
    z.object({
      id: z.string(),
      kind: z.string(),
      refType: z.string(),
      createdAt: z.string(),
      lines: z.array(z.object({ account: z.string(), debitNgwee: Ngwee, creditNgwee: Ngwee })),
    }),
  ),
  campaigns: z.array(z.object({ slug: z.string(), title: z.string(), raisedNgwee: SignedNgwee })),
  jobs: z.object({
    enabled: z.boolean(),
    outbox: z.object({ waiting: z.number().int(), relayed: z.number().int() }),
    queue: z.record(z.string(), z.number().int()).nullable(),
  }),
});
export type DevLedgerResponse = z.infer<typeof DevLedgerResponse>;

/** The pretend mobile money network (slice 6): what "the network" does with a waiting prompt. */
export const DEV_PAYMENT_OUTCOMES = [
  'approve',
  'insufficient_funds',
  'wrong_pin',
  'cancelled',
  'expire',
  'ambiguous',
] as const;
export const DevPaymentDecision = z.strictObject({ outcome: z.enum(DEV_PAYMENT_OUTCOMES) });
export type DevPaymentDecision = z.infer<typeof DevPaymentDecision>;

export const DevPaymentsResponse = z.object({
  provider: z.enum(['FAKE', 'ZYNLE']),
  requests: z.array(
    z.object({
      reference: z.string(),
      network: z.enum(['MTN', 'AIRTEL']),
      maskedPhone: z.string(),
      amountNgwee: Ngwee,
      status: z.enum(['PENDING', 'SUCCESSFUL', 'FAILED', 'EXPIRED', 'UNKNOWN']),
      failureReason: z.string().optional(),
      feeNgwee: Ngwee.optional(),
      createdAt: z.number().int(),
    }),
  ),
});
export type DevPaymentsResponse = z.infer<typeof DevPaymentsResponse>;
