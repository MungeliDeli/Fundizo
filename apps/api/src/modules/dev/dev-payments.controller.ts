import { Body, Controller, Get, HttpCode, Inject, Param, Post, Res } from '@nestjs/common';
import { DevPaymentDecision, type DevPaymentsResponse } from '@fundizo/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { AppError, Errors } from '../../common/app-error.js';
import { FakeProvider } from '../../infra/payments/fake.provider.js';
import { PAYMENT_PROVIDER, type PaymentProvider } from '../../infra/payments/payment-provider.js';
import { DonationsService } from '../payments/donations.service.js';
import { PaymentCallbacks } from '../payments/payment-callbacks.js';

const Id = z.uuid();

/**
 * Development only: "play the network" for the pretend provider. A decision changes the fake
 * network's answer and sends its signed callback through the real callback path, which only
 * queues a status check (money rule 7), exactly as a real callback would.
 */
@Controller('dev/payments')
export class DevPaymentsController {
  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly donations: DonationsService,
    private readonly callbacks: PaymentCallbacks,
  ) {}

  @Get()
  async list(@Res({ passthrough: true }) res: Response): Promise<DevPaymentsResponse> {
    res.setHeader('Cache-Control', 'no-store');
    const requests = this.provider instanceof FakeProvider ? await this.provider.list(30) : [];
    return { provider: this.provider.name, requests };
  }

  @Post(':reference/decide')
  @HttpCode(200)
  async decide(
    @Param('reference', { schema: Id }) reference: string,
    @Body({ schema: DevPaymentDecision }) body: DevPaymentDecision,
  ): Promise<{ ok: true }> {
    await this.play(reference, body);
    return { ok: true };
  }

  /** Same, addressed by donation (used by the dev box on the waiting screen). */
  @Post('donations/:donationId/decide')
  @HttpCode(200)
  async decideForDonation(
    @Param('donationId', { schema: Id }) donationId: string,
    @Body({ schema: DevPaymentDecision }) body: DevPaymentDecision,
  ): Promise<{ ok: true }> {
    const reference = await this.donations.openAttemptId(donationId);
    if (!reference) throw Errors.notFound();
    await this.play(reference, body);
    return { ok: true };
  }

  private async play(reference: string, body: DevPaymentDecision) {
    if (!(this.provider instanceof FakeProvider)) {
      throw new AppError('not_found', 404, 'Only the pretend provider can be played.');
    }
    const callback = await this.provider.decide(reference, body.outcome);
    if (!callback)
      throw new AppError('payment_in_progress', 409, 'That request already has a final answer.');
    await this.callbacks.receive(callback.headers, callback.body);
  }
}
