import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  CampaignDraftUpdate,
  CreateCampaignRequest,
  type OwnCampaign,
  type Photo,
  type PublicCampaign,
  UpdatePhotoRequest,
} from '@fundizo/shared';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthGuard, CurrentSession } from '../identity/auth.guard.js';
import type { ActiveSession } from '../identity/sessions.service.js';
import { CampaignPhotosService } from './campaign-photos.service.js';
import { CampaignsService } from './campaigns.service.js';

const CampaignId = z.uuid();
const Slug = z.string().regex(/^[a-z0-9-]{3,80}$/);

/** The organiser's own fundraisers (drafts and live). Everything is scoped to the session's user. */
@Controller('campaigns')
@UseGuards(AuthGuard)
export class CampaignsController {
  constructor(
    private readonly campaigns: CampaignsService,
    private readonly photos: CampaignPhotosService,
  ) {}

  /**
   * Upload one photo as the raw request body (Content-Type image/jpeg, png or webp; 8 MB max).
   * The server re-encodes it and stores only the cleaned WebP versions (C-05, ADR 0005).
   */
  @Post(':id/photos')
  @HttpCode(201)
  async addPhoto(
    @CurrentSession() s: ActiveSession,
    @Param('id', { schema: CampaignId }) id: string,
    @Req() req: Request,
  ): Promise<{ photos: Photo[] }> {
    return { photos: await this.photos.add(s.user.id, id, req.body as unknown) };
  }

  @Patch(':id/photos/:photoId')
  async updatePhoto(
    @CurrentSession() s: ActiveSession,
    @Param('id', { schema: CampaignId }) id: string,
    @Param('photoId', { schema: CampaignId }) photoId: string,
    @Body({ schema: UpdatePhotoRequest }) body: UpdatePhotoRequest,
  ): Promise<{ photos: Photo[] }> {
    return { photos: await this.photos.update(s.user.id, id, photoId, body) };
  }

  @Delete(':id/photos/:photoId')
  async removePhoto(
    @CurrentSession() s: ActiveSession,
    @Param('id', { schema: CampaignId }) id: string,
    @Param('photoId', { schema: CampaignId }) photoId: string,
  ): Promise<{ photos: Photo[] }> {
    return { photos: await this.photos.remove(s.user.id, id, photoId) };
  }

  @Post()
  @HttpCode(201)
  async create(
    @CurrentSession() s: ActiveSession,
    @Body({ schema: CreateCampaignRequest }) body: CreateCampaignRequest,
  ): Promise<{ campaign: OwnCampaign }> {
    return { campaign: await this.campaigns.create(s.user.id, body.beneficiary) };
  }

  @Get('mine')
  async mine(@CurrentSession() s: ActiveSession): Promise<{ campaigns: OwnCampaign[] }> {
    return { campaigns: await this.campaigns.listOwn(s.user.id) };
  }

  @Get(':id')
  async get(
    @CurrentSession() s: ActiveSession,
    @Param('id', { schema: CampaignId }) id: string,
  ): Promise<{ campaign: OwnCampaign }> {
    return { campaign: await this.campaigns.getOwn(s.user.id, id) };
  }

  @Patch(':id')
  async update(
    @CurrentSession() s: ActiveSession,
    @Param('id', { schema: CampaignId }) id: string,
    @Body({ schema: CampaignDraftUpdate }) body: CampaignDraftUpdate,
  ): Promise<{ campaign: OwnCampaign }> {
    return { campaign: await this.campaigns.update(s.user.id, id, body) };
  }

  @Post(':id/publish')
  @HttpCode(200)
  async publish(
    @CurrentSession() s: ActiveSession,
    @Param('id', { schema: CampaignId }) id: string,
  ): Promise<{ campaign: OwnCampaign }> {
    return { campaign: await this.campaigns.publish(s.user.id, id) };
  }
}

/** Public fundraiser pages. No session needed; never exposes phone numbers or emails. */
@Controller('public/campaigns')
export class PublicCampaignsController {
  constructor(private readonly campaigns: CampaignsService) {}

  @Get(':slug')
  async get(
    @Param('slug', { schema: Slug }) slug: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ campaign: PublicCampaign }> {
    res.setHeader('Cache-Control', 'public, max-age=30');
    return { campaign: await this.campaigns.getPublic(slug) };
  }
}
