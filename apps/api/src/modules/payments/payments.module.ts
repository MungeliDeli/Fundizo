import { Module } from '@nestjs/common';
import { RateLimiter } from '../../common/rate-limiter.js';
import { CampaignsModule } from '../campaigns/campaigns.module.js';
import { LedgerModule } from '../ledger/ledger.module.js';
import { DonationsController, DonorWallController } from './donations.controller.js';
import { DonationsService } from './donations.service.js';
import { PaymentCallbacksController } from './payment-callbacks.controller.js';
import { PaymentCallbacks } from './payment-callbacks.js';
import { PaymentFlow } from './payment-flow.service.js';

/**
 * Payments (D-*): guest donations, payment attempts and provider callbacks. Uses campaigns and the
 * ledger only through their public services; publishes payment.attempt_created and donation.confirmed.
 */
@Module({
  imports: [CampaignsModule, LedgerModule],
  controllers: [DonationsController, DonorWallController, PaymentCallbacksController],
  providers: [DonationsService, PaymentFlow, PaymentCallbacks, RateLimiter],
  // For the dev network panel only (DevModule, never loaded in production).
  exports: [DonationsService, PaymentCallbacks],
})
export class PaymentsModule {}
