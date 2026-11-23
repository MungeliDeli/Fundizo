import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { Errors } from '../../common/app-error.js';
import { readCookie } from '../../common/cookies.js';
import { type ActiveSession, SESSION_COOKIE, SessionsService } from './sessions.service.js';

type AuthedRequest = Request & { auth?: ActiveSession };

/** Requires a valid session cookie; puts the session and user on the request. */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly sessions: SessionsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    const active = token ? await this.sessions.resolve(token) : null;
    if (!active) throw Errors.unauthenticated();
    req.auth = active;
    return true;
  }
}

/** The current session (only on routes guarded by AuthGuard). */
export const CurrentSession = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): ActiveSession => {
    const auth = ctx.switchToHttp().getRequest<AuthedRequest>().auth;
    if (!auth) throw Errors.unauthenticated();
    return auth;
  },
);
