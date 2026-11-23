import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import {
  type AcceptedResponse,
  type AuthProvidersResponse,
  EmailOnlyRequest,
  LoginRequest,
  ResetPasswordRequest,
  type SessionResponse,
  SignupRequest,
  VerifyEmailRequest,
} from '@fundizo/shared';
import type { Request, Response } from 'express';
import { Inject } from '@nestjs/common';
import { readCookie } from '../../common/cookies.js';
import { ENV, type Env } from '../../config/env.js';
import { AuthGuard, CurrentSession } from './auth.guard.js';
import { cookieOptions } from './cookies.js';
import { AuthService, type SignedIn } from './auth.service.js';
import {
  type ActiveSession,
  type RequestMeta,
  SESSION_COOKIE,
  SessionsService,
} from './sessions.service.js';
import { UserViewService } from './user-view.service.js';

const ACCEPTED: AcceptedResponse = { ok: true };

/** Email + password accounts and sessions (A-01, A-03). See docs/features/A-01-email-signup.md. */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionsService,
    private readonly view: UserViewService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post('signup')
  @HttpCode(202)
  async signup(
    @Body({ schema: SignupRequest }) body: SignupRequest,
    @Req() req: Request,
  ): Promise<AcceptedResponse> {
    await this.auth.signup(body, meta(req));
    return ACCEPTED;
  }

  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(
    @Body({ schema: VerifyEmailRequest }) body: VerifyEmailRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    return this.startSession(res, await this.auth.verifyEmail(body, meta(req)));
  }

  @Post('resend-verification')
  @HttpCode(202)
  async resend(
    @Body({ schema: EmailOnlyRequest }) body: EmailOnlyRequest,
  ): Promise<AcceptedResponse> {
    await this.auth.resendVerification(body.email);
    return ACCEPTED;
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body({ schema: LoginRequest }) body: LoginRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    return this.startSession(res, await this.auth.login(body, meta(req)));
  }

  @Post('password/forgot')
  @HttpCode(202)
  async forgot(
    @Body({ schema: EmailOnlyRequest }) body: EmailOnlyRequest,
    @Req() req: Request,
  ): Promise<AcceptedResponse> {
    await this.auth.forgotPassword(body.email, meta(req));
    return ACCEPTED;
  }

  @Post('password/reset')
  @HttpCode(200)
  async reset(
    @Body({ schema: ResetPasswordRequest }) body: ResetPasswordRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    return this.startSession(res, await this.auth.resetPassword(body, meta(req)));
  }

  @Get('me')
  @UseGuards(AuthGuard)
  async me(
    @CurrentSession() session: ActiveSession,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponse> {
    res.setHeader('Cache-Control', 'no-store');
    return { user: await this.view.publicUser(session.user) };
  }

  /** Which sign-in methods this deployment offers, so the web app can show the right buttons. */
  @Get('providers')
  providers(): AuthProvidersResponse {
    return { google: Boolean(this.env.GOOGLE_CLIENT_ID && this.env.GOOGLE_CLIENT_SECRET) };
  }

  /** Always succeeds and always clears the cookie, even if the session was already gone. */
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = readCookie(req.headers.cookie, SESSION_COOKIE);
    if (token) await this.sessions.revoke(token);
    res.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  @Post('logout-others')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async logoutOthers(@CurrentSession() session: ActiveSession): Promise<{ revoked: number }> {
    return { revoked: await this.sessions.revokeOthers(session.user.id, session.sessionId) };
  }

  private async startSession(res: Response, signedIn: SignedIn): Promise<SessionResponse> {
    res.cookie(SESSION_COOKIE, signedIn.session.token, {
      ...this.cookieOptions(),
      expires: signedIn.session.expiresAt,
    });
    res.setHeader('Cache-Control', 'no-store');
    return { user: await this.view.publicUser(signedIn.user) };
  }

  private cookieOptions() {
    return cookieOptions(this.env);
  }
}

function meta(req: Request): RequestMeta {
  return { ip: req.ip, userAgent: req.headers['user-agent'] };
}
