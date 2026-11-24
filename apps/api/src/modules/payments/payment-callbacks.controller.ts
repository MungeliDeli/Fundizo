import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { AppError } from '../../common/app-error.js';
import { SkipCsrf } from '../../common/csrf.guard.js';
import { PaymentCallbacks } from './payment-callbacks.js';
import { z } from 'zod';

const ProviderPath = z.enum(['fake']);

/**
 * Where providers send payment callbacks. Server-to-server, so no CSRF header; each provider's
 * adapter authenticates its own callbacks (fake: HMAC signature + timestamp).
 */
@Controller('payments/callbacks')
export class PaymentCallbacksController {
  constructor(private readonly callbacks: PaymentCallbacks) {}

  @Post(':provider')
  @SkipCsrf()
  @HttpCode(200)
  async receive(
    @Param('provider', { schema: ProviderPath }) _provider: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ): Promise<{ ok: true }> {
    if (!(await this.callbacks.receive(headers, body))) {
      throw new AppError('unauthenticated', 401, 'Callback not accepted.');
    }
    return { ok: true };
  }
}
