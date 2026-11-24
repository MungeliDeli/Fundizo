import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { paymentAttempts } from '../../db/schema/index.js';
import { DB, type Database } from '../../infra/database/database.module.js';
import {
  type CallbackHeaders,
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

  /** Returns false when the callback isn't genuine. Unknown references are acknowledged and ignored. */
  async receive(headers: CallbackHeaders, body: unknown): Promise<boolean> {
    const hint = this.provider.parseCallback(headers, body);
    if (!hint) {
      this.log.warn('rejected a payment callback that failed authentication');
      return false;
    }
    const [a] = await this.db
      .select({ id: paymentAttempts.id })
      .from(paymentAttempts)
      .where(eq(paymentAttempts.id, hint.reference));
    if (a) await this.flow.checkSoon(a.id);
    return true;
  }
}
