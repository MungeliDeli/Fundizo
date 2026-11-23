import { Global, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ENV, type Env } from '../../config/env.js';
import { REDIS } from '../redis/redis.module.js';
import { BrevoSms } from './brevo.sms.js';
import { MESSAGING, type Messaging } from './messaging.js';
import { OutboxSms } from './outbox.sms.js';

@Global()
@Module({
  providers: [
    {
      provide: MESSAGING,
      inject: [ENV, REDIS],
      useFactory: (env: Env, redis: Redis): Messaging =>
        env.SMS_TRANSPORT === 'brevo' && env.BREVO_API_KEY && env.NODE_ENV !== 'test'
          ? new BrevoSms(env.BREVO_API_KEY, env.SMS_SENDER)
          : new OutboxSms(redis),
    },
  ],
  exports: [MESSAGING],
})
export class SmsModule {}
