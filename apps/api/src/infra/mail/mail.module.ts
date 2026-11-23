import { Global, Logger, Module } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ENV, type Env } from '../../config/env.js';
import { REDIS } from '../redis/redis.module.js';
import { BrevoMailer } from './brevo.mailer.js';
import { MAILER, type Mailer } from './mailer.js';
import { OutboxMailer } from './outbox.mailer.js';

@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [ENV, REDIS],
      useFactory: (env: Env, redis: Redis): Mailer => {
        if (env.BREVO_API_KEY && env.NODE_ENV !== 'test') {
          return new BrevoMailer(env.BREVO_API_KEY, {
            email: env.MAIL_FROM_EMAIL,
            name: env.MAIL_FROM_NAME,
          });
        }
        new Logger('MailModule').warn(
          'No BREVO_API_KEY: emails go to the dev outbox (/dev/outbox)',
        );
        return new OutboxMailer(redis);
      },
    },
  ],
  exports: [MAILER],
})
export class MailModule {}
