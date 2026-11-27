import { Body, Controller, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../../common/app-error.js';
import { SkipCsrf } from '../../common/csrf.guard.js';
import { PaymentCallbacks } from './payment-callbacks.js';

const ProviderPath = z.enum(['fake', 'zynle']);
const TokenPath = z.string().regex(/^[A-Za-z0-9_-]{16,128}$/);

/**
 * Where providers send payment callbacks. Server-to-server, so no CSRF header. Each adapter
 * authenticates its own callbacks: the fake signs them; ZynlePay doesn't, so its callback URL ends
 * in a secret token. Either way a callback only triggers a status check (money rule 7).
 */
@Controller('payments/callbacks')
export class PaymentCallbacksController {
  constructor(private readonly callbacks: PaymentCallbacks) {}

  @Post(':provider')
  @SkipCsrf()
  @HttpCode(200)
  async receive(
    @Param('provider', { schema: ProviderPath }) provider: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ): Promise<unknown> {
    return this.accept(await this.callbacks.receive(provider, { headers, body }));
  }

  @Post(':provider/:token')
  @SkipCsrf()
  @HttpCode(200)
  async receiveWithToken(
    @Param('provider', { schema: ProviderPath }) provider: string,
    @Param('token', { schema: TokenPath }) token: string,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
  ): Promise<unknown> {
    return this.accept(await this.callbacks.receive(provider, { headers, body, pathToken: token }));
  }

  private accept(ack: unknown) {
    if (ack === null) throw new AppError('unauthenticated', 401, 'Callback not accepted.');
    return ack;
  }
}
