import { createHmac } from 'node:crypto';
import { Global, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ENV, type Env } from '../../config/env.js';
import { REDIS } from '../redis/redis.module.js';
import { FakeProvider } from './fake.provider.js';
import { PAYMENT_PROVIDER } from './payment-provider.js';
import { ZynleProvider } from './zynle.provider.js';

/** Chooses the mobile money adapter from PAYMENT_PROVIDER. Production refuses the fake (env.ts). */
@Global()
@Module({
  providers: [
    {
      provide: PAYMENT_PROVIDER,
      inject: [ENV, REDIS],
      useFactory: (env: Env, redis: Redis) => {
        if (env.PAYMENT_PROVIDER === 'zynle') return zynleFrom(env);
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

function zynleFrom(env: Env): ZynleProvider {
  const {
    ZYNLE_MERCHANT_ID,
    ZYNLE_API_ID,
    ZYNLE_API_KEY,
    ZYNLE_CALLBACK_TOKEN,
    ZYNLE_AMOUNT_UNIT,
  } = env;
  // env.ts already refuses to start without these; this narrows the types.
  if (
    !ZYNLE_MERCHANT_ID ||
    !ZYNLE_API_ID ||
    !ZYNLE_API_KEY ||
    !ZYNLE_CALLBACK_TOKEN ||
    !ZYNLE_AMOUNT_UNIT
  ) {
    throw new Error('ZynlePay settings are incomplete');
  }
  const base = env.ZYNLE_BASE_URL.replace(/\/+$/, '');
  return new ZynleProvider({
    baseUrl: base,
    statusUrl: env.ZYNLE_STATUS_URL ?? `${base}/paymentstatus`,
    merchantId: ZYNLE_MERCHANT_ID,
    apiId: ZYNLE_API_ID,
    apiKey: ZYNLE_API_KEY,
    callbackToken: ZYNLE_CALLBACK_TOKEN,
    amountUnit: ZYNLE_AMOUNT_UNIT,
    phoneFormat: env.ZYNLE_PHONE_FORMAT,
    feeBasisPoints: env.ZYNLE_FEE_BASIS_POINTS,
  });
}
