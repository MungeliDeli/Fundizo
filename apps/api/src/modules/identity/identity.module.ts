import { Module } from '@nestjs/common';
import { RateLimiter } from '../../common/rate-limiter.js';
import { ENV, type Env } from '../../config/env.js';
import { GOOGLE_OAUTH, GoogleOAuthClient } from '../../infra/google/google-oauth.js';
import { AuthController } from './auth.controller.js';
import { AuthGuard } from './auth.guard.js';
import { AuthService } from './auth.service.js';
import { GoogleAuthController } from './google-auth.controller.js';
import { GoogleAuthService } from './google-auth.service.js';
import { MeController } from './me.controller.js';
import { ProfileService } from './profile.service.js';
import { SessionsService } from './sessions.service.js';
import { UserContacts } from './user-contacts.service.js';
import { UserDirectory } from './user-directory.service.js';
import { UserViewService } from './user-view.service.js';

/** Identity: users, sessions, email and Google sign-in (ADR 0004). Other modules use AuthGuard only. */
@Module({
  controllers: [AuthController, GoogleAuthController, MeController],
  providers: [
    AuthService,
    GoogleAuthService,
    ProfileService,
    SessionsService,
    UserViewService,
    UserDirectory,
    UserContacts,
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
  // Public interface for other modules: the session guard, a read-only user directory, and
  // contact details for the notifications module only.
  exports: [AuthGuard, SessionsService, UserDirectory, UserContacts],
})
export class IdentityModule {}
