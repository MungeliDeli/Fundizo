import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { paymentAttempts } from '../../db/schema/index.js';
import { DB, type Database } from '../../infra/database/database.module.js';
import {
  type CallbackRequest,
  PAYMENT_PROVIDER,
  type PaymentProvider,
} from '../../infra/payments/payment-provider.js';
import { PaymentFlow } from './payment-flow.service.js';

/**
 * Provider callbacks are hints (money rule 7): authenticate, find the attempt, queue a status
 * check, answer at once. Nothing here changes a payment's state.
 */
@Injectable()
export class PaymentCallbacks {
  private readonly log = new Logger(PaymentCallbacks.name);

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly flow: PaymentFlow,
  ) {}

  /**
   * Returns the provider's acknowledgement, or null when the callback isn't genuine (or is meant for
   * another provider). Unknown references are acknowledged and ignored.
   */
  async receive(provider: string, req: CallbackRequest): Promise<unknown> {
    const hint =
      provider === this.provider.name.toLowerCase() ? this.provider.parseCallback(req) : null;
    if (!hint) {
      this.log.warn({ provider }, 'rejected a payment callback that failed authentication');
      return null;
    }
    const [a] = await this.db
      .select({ id: paymentAttempts.id })
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, hint.reference));
    if (a) await this.flow.checkSoon(a.id);
    return this.provider.acknowledge(hint);
  }
}
