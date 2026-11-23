import { Body, Controller, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import {
  type AcceptedResponse,
  SendPhoneCodeRequest,
  type SessionResponse,
  UpdateProfileRequest,
  VerifyPhoneRequest,
} from '@fundizo/shared';
import type { Request } from 'express';
import { AuthGuard, CurrentSession } from './auth.guard.js';
import { ProfileService } from './profile.service.js';
import type { ActiveSession } from './sessions.service.js';
import { UserViewService } from './user-view.service.js';

/**
 * The signed-in person's own profile and phone (A-02, A-13). Every route acts on the session's
 * user only: there is no user id in any path or body, so one person can't change another's data.
 */
@Controller('me')
@UseGuards(AuthGuard)
export class MeController {
  constructor(
    private readonly profile: ProfileService,
    private readonly view: UserViewService,
  ) {}

  @Patch('profile')
  async updateProfile(
    @CurrentSession() session: ActiveSession,
    @Body({ schema: UpdateProfileRequest }) body: UpdateProfileRequest,
  ): Promise<SessionResponse> {
    return {
      user: await this.view.publicUser(await this.profile.updateProfile(session.user.id, body)),
    };
  }

  @Post('phone/code')
  @HttpCode(202)
  async sendPhoneCode(
    @CurrentSession() session: ActiveSession,
    @Body({ schema: SendPhoneCodeRequest }) body: SendPhoneCodeRequest,
    @Req() req: Request,
  ): Promise<AcceptedResponse> {
    await this.profile.sendPhoneCode(session.user, body.phone, req.ip);
    return { ok: true };
  }

  @Post('phone/verify')
  @HttpCode(200)
  async verifyPhone(
    @CurrentSession() session: ActiveSession,
    @Body({ schema: VerifyPhoneRequest }) body: VerifyPhoneRequest,
  ): Promise<SessionResponse> {
    return { user: await this.view.publicUser(await this.profile.verifyPhone(session.user, body)) };
  }
}
