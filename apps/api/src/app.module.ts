import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { CsrfGuard } from './common/csrf.guard.js';
import { HttpExceptionFilter } from './common/http-exception.filter.js';
import { createValidationPipe } from './common/validation.js';
import { ConfigModule } from './config/config.module.js';
import { ENV, type Env } from './config/env.js';
import { DatabaseModule } from './infra/database/database.module.js';
import { MailModule } from './infra/mail/mail.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { SmsModule } from './infra/sms/sms.module.js';
import { CampaignsModule } from './modules/campaigns/campaigns.module.js';
import { DevModule } from './modules/dev/dev.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { IdentityModule } from './modules/identity/identity.module.js';

// Dev-only routes (/dev/outbox) are never registered in production.
const devModules = process.env.NODE_ENV === 'production' ? [] : [DevModule];

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        pinoHttp: {
          level: env.LOG_LEVEL,
          // Never log secrets or personal data (SECURITY.md). Extend this list as fields appear.
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'res.headers["set-cookie"]',
              '*.otp',
              '*.code',
              '*.msisdn',
              '*.phone',
              '*.password',
              'req.body',
              '*.token',
              '*.refreshToken',
            ],
            censor: '[redacted]',
          },
          // Health checks are polled constantly; keep them out of the logs.
          autoLogging: { ignore: (req) => req.url === '/health' },
          transport:
            env.NODE_ENV === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
        },
      }),
    }),
    DatabaseModule,
    RedisModule,
    MailModule,
    SmsModule,
    HealthModule,
    IdentityModule,
    CampaignsModule,
    ...devModules,
  ],
  providers: [
    // Registered here (not in main.ts) so tests get exactly the same protections.
    { provide: APP_GUARD, useClass: CsrfGuard },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_PIPE, useFactory: createValidationPipe },
  ],
})
export class AppModule {}
