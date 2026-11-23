import { Controller, Get, Inject, Logger, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { readCookie } from '../../common/cookies.js';
import { ENV, type Env } from '../../config/env.js';
import { OAUTH_STATE_COOKIE, SESSION_COOKIE, cookieOptions } from './cookies.js';
import { GoogleAuthService, GoogleSignInFailure } from './google-auth.service.js';
import { SessionsService } from './sessions.service.js';

const OAUTH_COOKIE_MAX_AGE_MS = 10 * 60 * 1000;

/**
 * Browser-facing Google sign-in (A-12). These are top-level page navigations (GET), so they answer
 * with redirects, never JSON. Every failure lands on /login (or /account when linking) with a
 * fixed reason code, never free text.
 */
@Controller('auth/google')
export class GoogleAuthController {
  private readonly logger = new Logger(GoogleAuthController.name);

  constructor(
    private readonly google: GoogleAuthService,
    private readonly sessions: SessionsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get('start')
  async start(
    @Query('next') next: unknown,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    // Already signed in → this is "Connect Google" from the account page.
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    const current = token ? await this.sessions.resolve(token) : null;
    try {
      const { url, state } = await this.google.start({
        next,
        linkUserId: current?.user.id ?? null,
        ip: req.ip,
      });
      res.cookie(OAUTH_STATE_COOKIE, state, {
        ...cookieOptions(this.env),
        maxAge: OAUTH_COOKIE_MAX_AGE_MS,
      });
      res.setHeader('Cache-Control', 'no-store');
      res.redirect(302, url);
    } catch (err) {
      this.fail(res, err, current ? '/account' : '/login');
    }
  }

  @Get('callback')
  async callback(
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const cookieState = readCookie(req.headers.cookie, OAUTH_STATE_COOKIE);
    res.clearCookie(OAUTH_STATE_COOKIE, cookieOptions(this.env));
    res.setHeader('Cache-Control', 'no-store');
    const signedIn = Boolean(readCookie(req.headers.cookie, SESSION_COOKIE));
    try {
      const result = await this.google.callback({
        code: query.code,
        state: query.state,
        error: query.error,
        cookieState,
        meta: { ip: req.ip, userAgent: req.headers['user-agent'] },
      });
      if (result.session) {
        res.cookie(SESSION_COOKIE, result.session.token, {
          ...cookieOptions(this.env),
          expires: result.session.expiresAt,
        });
      }
      const target = new URL(result.next, this.env.WEB_BASE_URL);
      if (!result.session) target.searchParams.set('google', 'linked');
      res.redirect(302, target.toString());
    } catch (err) {
      this.fail(res, err, signedIn ? '/account' : '/login');
    }
  }

  private fail(res: Response, err: unknown, page: '/login' | '/account') {
    if (!(err instanceof GoogleSignInFailure))
      this.logger.error(err instanceof Error ? err : { err }, 'Google sign-in error');
    const reason = err instanceof GoogleSignInFailure ? err.reason : 'failed';
    const target = new URL(page, this.env.WEB_BASE_URL);
    target.searchParams.set('error', `google_${reason}`);
    res.redirect(302, target.toString());
  }
}
