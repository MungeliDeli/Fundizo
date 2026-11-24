import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type FailureReason, maskPhone } from '@fundizo/shared';
import { and, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env.js';
import { type AttemptStatus, donations, paymentAttempts } from '../../db/schema/index.js';
import { DB, type Database } from '../../infra/database/database.module.js';
import {
  PAYMENT_PROVIDER,
  type PaymentProvider,
  type ProviderStatus,
} from '../../infra/payments/payment-provider.js';
import { DelayedJobs } from '../../jobs/delayed-jobs.js';
import { EventHandlers } from '../../jobs/event-handlers.js';
import { OutboxService } from '../../jobs/outbox.service.js';
import { LedgerService } from '../ledger/ledger.service.js';
import type { PostingLine } from '../ledger/posting.js';
import { DonationConfirmed, PaymentAttemptCreated } from './events.js';

const CHECK_TASK = 'payments.check-status';
const CheckJob = z.strictObject({ attemptId: z.uuid(), n: z.number().int().min(-1).max(50) });

const FINAL: ReadonlySet<AttemptStatus> = new Set(['successful', 'failed', 'expired']);

/**
 * The money path for one payment attempt (D-09), run by workers, never inside a web request:
 *
 *   attempt created ─(outbox)→ send prompt ─→ status checks at 10 s, 30 s, 1 m, 2 m, 5 m
 *                                               ↑ a callback only triggers an extra check
 *
 * Only a status check moves an attempt forward (money rule 7). Settling a success writes the attempt,
 * the donation, the ledger entries and the DonationConfirmed event in ONE transaction (rule 5).
 * Every step is safe to repeat. `unknown` is never success (rule 8).
 */
@Injectable()
export class PaymentFlow implements OnModuleInit {
  private readonly log = new Logger(PaymentFlow.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly ledger: LedgerService,
    private readonly outbox: OutboxService,
    private readonly handlers: EventHandlers,
    private readonly delayed: DelayedJobs,
  ) {}

  onModuleInit() {
    this.handlers.on(PaymentAttemptCreated, 'payments.send-prompt', (e) =>
      this.sendPrompt(e.payload.attemptId),
    );
    this.delayed.register(CHECK_TASK, CheckJob, (d) => this.checkStatus(d.attemptId, d.n));
  }

  /** Ask the provider to push the PIN prompt. Claimed first, so a re-run can't push twice. */
  async sendPrompt(attemptId: string): Promise<void> {
    const [claimed] = await this.db
      .update(paymentAttempts)
      .set({ status: 'pending', promptSentAt: new Date() })
      .where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.status, 'initiated')))
      .returning();
    if (!claimed) {
      // Already claimed by an earlier run: just make sure the checks are scheduled.
      const [a] = await this.db
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, attemptId));
      if (a && !FINAL.has(a.status)) await this.scheduleChecks(attemptId);
      return;
    }
    try {
      const result = await this.provider.collect({
        reference: claimed.id,
        phoneE164: claimed.phoneE164,
        network: claimed.network,
        amountNgwee: claimed.amountNgwee,
        description: 'Fundizo donation',
      });
      if (!result.accepted) {
        await this.apply(attemptId, {
          status: 'FAILED',
          failureReason: result.failureReason ?? 'not_sent',
        });
        return;
      }
      if (result.providerRef) {
        await this.db
          .update(paymentAttempts)
          .set({ providerRef: result.providerRef })
          .where(eq(paymentAttempts.id, attemptId));
      }
    } catch (err) {
      // We can't know whether the request reached the network: the status checks will find out.
      this.log.warn({ attemptId, phone: maskPhone(claimed.phoneE164), err }, 'collect call failed');
    }
    await this.scheduleChecks(attemptId);
    this.log.log({ attemptId, network: claimed.network }, 'payment prompt requested');
  }

  /** Ask the provider. n = index in the schedule; -1 for an extra check (e.g. after a callback). */
  async checkStatus(attemptId: string, n: number): Promise<void> {
    const [a] = await this.db
      .select()
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, attemptId));
    if (!a || FINAL.has(a.status) || a.status === 'initiated') return;
    const result = await this.provider.getCollectionStatus(attemptId);
    await this.db
      .update(paymentAttempts)
      .set({ checkCount: sql`${paymentAttempts.checkCount} + 1`, lastCheckedAt: new Date() })
      .where(eq(paymentAttempts.id, attemptId));
    const lastScheduled = n === this.env.PAYMENT_STATUS_CHECKS_MS.length - 1;
    if (result.status === 'PENDING' && !lastScheduled) return;
    // Still no final answer after the last check: unknown (reconciliation settles it, slice 16).
    await this.apply(attemptId, result.status === 'PENDING' ? { status: 'UNKNOWN' } : result);
  }

  /** A callback arrived: check now (the callback's own content is never trusted). */
  async checkSoon(attemptId: string): Promise<void> {
    await this.delayed.schedule(
      CHECK_TASK,
      { attemptId, n: -1 },
      {
        delayMs: 0,
        jobId: `check.${attemptId}.cb.${Date.now()}`,
      },
    );
  }

  /** Move an attempt (and its donation) forward. Idempotent: final attempts never change again. */
  async apply(attemptId: string, result: ProviderStatus): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [a] = await tx
        .select()
        .from(paymentAttempts)
        .where(eq(paymentAttempts.id, attemptId))
        .for('update');
      if (!a || FINAL.has(a.status)) return;
      const now = new Date();

      if (result.status === 'SUCCESSFUL') {
        const fee = result.feeNgwee ?? 0;
        const [d] = await tx
          .select()
          .from(donations)
          .where(eq(donations.id, a.donationId))
          .for('update');
        if (!d) throw new Error('donation missing');
        if (!Number.isSafeInteger(fee) || fee < 0 || fee >= a.amountNgwee) {
          throw new Error('provider reported an impossible fee');
        }
        await tx
          .update(paymentAttempts)
          .set({ status: 'successful', feeNgwee: fee, finishedAt: now })
          .where(eq(paymentAttempts.id, a.id));
        await tx
          .update(donations)
          .set({ status: 'successful', networkFeeNgwee: fee, settledAt: now })
          .where(eq(donations.id, d.id));
        await this.ledger.post(tx, {
          kind: 'donation_settled',
          ref: { type: 'payment_attempt', id: a.id },
          lines: settlementLines({
            campaignId: d.campaignId,
            provider: a.provider,
            network: a.network,
            amountNgwee: d.amountNgwee,
            tipNgwee: d.tipNgwee,
            feeNgwee: fee,
          }),
        });
        await this.outbox.add(tx, DonationConfirmed, {
          donationId: d.id,
          campaignId: d.campaignId,
        });
        this.log.log({ attemptId, donationId: d.id }, 'donation settled');
        return;
      }

      const status: AttemptStatus =
        result.status === 'FAILED' ? 'failed' : result.status === 'EXPIRED' ? 'expired' : 'unknown';
      if (status === a.status) return;
      const failureReason: FailureReason | null =
        status === 'failed' ? (result.failureReason ?? 'declined') : null;
      await tx
        .update(paymentAttempts)
        .set({ status, failureReason, finishedAt: status === 'unknown' ? null : now })
        .where(eq(paymentAttempts.id, a.id));
      await tx.update(donations).set({ status }).where(eq(donations.id, a.donationId));
      this.log.log({ attemptId, status, failureReason }, 'payment attempt updated');
    });
  }

  private async scheduleChecks(attemptId: string) {
    const offsets = this.env.PAYMENT_STATUS_CHECKS_MS;
    for (const [n, delayMs] of offsets.entries()) {
      await this.delayed.schedule(
        CHECK_TASK,
        { attemptId, n },
        {
          delayMs,
          jobId: `check.${attemptId}.${n}`,
        },
      );
    }
  }
}

/**
 * How one settled payment is recorded (SPEC → tips and fees). The network keeps its fee; the
 * campaign bears the fee on the donation and the platform the fee on the tip, in proportion.
 *
 *   Dr provider_clearing   total − fee   (what reached the wallet)
 *   Dr network_fees        fee on tip    (the platform's cost)
 *   Cr campaign_funds      amount − fee on donation
 *   Cr platform_tips       tip           (gross revenue)
 */
export function settlementLines(p: {
  campaignId: string;
  provider: 'FAKE' | 'ZYNLE';
  network: 'MTN' | 'AIRTEL';
  amountNgwee: number;
  tipNgwee: number;
  feeNgwee: number;
}): PostingLine[] {
  const total = p.amountNgwee + p.tipNgwee;
  const feeOnTip = Math.floor((p.feeNgwee * p.tipNgwee) / total);
  const feeOnDonation = p.feeNgwee - feeOnTip;
  const where = { provider: p.provider, network: p.network } as const;
  const lines: PostingLine[] = [
    { account: { kind: 'provider_clearing', ...where }, debitNgwee: total - p.feeNgwee },
    {
      account: { kind: 'campaign_funds', campaignId: p.campaignId },
      creditNgwee: p.amountNgwee - feeOnDonation,
    },
  ];
  if (feeOnTip > 0)
    lines.push({ account: { kind: 'network_fees', ...where }, debitNgwee: feeOnTip });
  if (p.tipNgwee > 0) lines.push({ account: { kind: 'platform_tips' }, creditNgwee: p.tipNgwee });
  return lines;
}
