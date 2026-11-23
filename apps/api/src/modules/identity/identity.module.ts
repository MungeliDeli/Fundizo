import { Module } from '@nestjs/common';
import { RateLimiter } from '../../common/rate-limiter.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { SessionsService } from './sessions.service.js';

/** Identity: users, sessions, email verification (ADR 0004). Other modules use AuthGuard only. */
@Module({
  controllers: [AuthController],
  providers: [AuthService, SessionsService, AuthGuard, RateLimiter],
  exports: [AuthGuard, SessionsService],
})
export class IdentityModule {}
