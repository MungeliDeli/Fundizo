import { createHmac } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ENV, type Env } from '../../config/env.js';
import { REDIS } from '../redis/redis.module.js';
import { FakeProvider } from './fake.provider.js';
import { PAYMENT_PROVIDER } from './payment-provider.js';

/** Chooses the mobile money adapter from PAYMENT_PROVIDER. Production refuses the fake (env.ts). */
@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      inject: [ENV, REDIS],
      useFactory: (env: Env, redis: Redis) => {
        if (env.PAYMENT_PROVIDER === 'zynle') {
          throw new Error('PAYMENT_PROVIDER=zynle arrives with the ZynlePay slice (8)');
        }
        // A separate key for the pretend network's callback signatures, derived from AUTH_SECRET.
        const secret = createHmac('sha256', env.AUTH_SECRET)
          .update('fake-provider-callbacks')
          .digest('hex');
        return new FakeProvider(redis, secret);
      },
    },
  ],
  exports: [PAYMENT_PROVIDER],
})
export class PaymentProviderModule {}
