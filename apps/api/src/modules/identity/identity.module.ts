import { Module } from '@nestjs/common';
import { RateLimiter } from '../../common/rate-limiter.js';
import { ENV, type Env } from '../../config/env.js';
import { GOOGLE_OAUTH, GoogleOAuthClient } from '../../infra/google/google-oauth.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { GoogleAuthController } from './google-auth.controller.js';
import { GoogleAuthService } from './google-auth.service.js';
import { SessionsService } from './sessions.service.js';
import { UserViewService } from './user-view.service.js';

/** Identity: users, sessions, email and Google sign-in (ADR 0004). Other modules use AuthGuard only. */
@Module({
  controllers: [AuthController, GoogleAuthController],
  providers: [
    AuthService,
    GoogleAuthService,
    SessionsService,
    UserViewService,
    AuthGuard,
    RateLimiter,
    {
      provide: GOOGLE_OAUTH,
      inject: [ENV],
      useFactory: (env: Env) =>
        env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
          ? new GoogleOAuthClient(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET)
          : null,
    },
  ],
  exports: [AuthGuard, SessionsService],
})
export class IdentityModule {}
