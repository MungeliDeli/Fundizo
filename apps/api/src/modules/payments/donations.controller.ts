import { Body, Controller, Get, Headers, HttpCode, Ip, Param, Post, Res } from '@nestjs/common';
import {
  CreateDonationRequest,
  DONATION_TOKEN_HEADER,
  type DonationView,
  IDEMPOTENCY_HEADER,
  type PublicDonationsResponse,
  RetryDonationRequest,
} from '@fundizo/shared';
import type { Response } from 'express';
import { z } from 'zod';
import { DonationsService } from './donations.service.js';

const DonationId = z.uuid();
const Slug = z.string().regex(/^[a-z0-9-]{3,80}$/);

/**
 * Guest donations (D-01 – D-10). No session: the device that started a donation proves it with
 * X-Donation-Token. Money-moving requests need an Idempotency-Key. Responses are never cached.
 */
@Controller('donations')
export class DonationsController {
  constructor(private readonly donations: DonationsService) {}

  @Post()
  @HttpCode(201)
  async create(
    @Body({ schema: CreateDonationRequest }) body: CreateDonationRequest,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Ip() ip: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ donation: DonationView; accessToken: string }> {
    res.setHeader('Cache-Control', 'no-store');
    return this.donations.create(body, key, ip);
  }

  @Get(':id')
  async get(
    @Param('id', { schema: DonationId }) id: string,
    @Headers(DONATION_TOKEN_HEADER) token: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ donation: DonationView }> {
    res.setHeader('Cache-Control', 'no-store');
    return { donation: await this.donations.view(id, token) };
  }

  @Post(':id/attempts')
  @HttpCode(201)
  async retry(
    @Param('id', { schema: DonationId }) id: string,
    @Body({ schema: RetryDonationRequest }) body: RetryDonationRequest,
    @Headers(DONATION_TOKEN_HEADER) token: string | undefined,
    @Headers(IDEMPOTENCY_HEADER) key: string | undefined,
    @Ip() ip: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ donation: DonationView }> {
    res.setHeader('Cache-Control', 'no-store');
    return { donation: await this.donations.retry(id, token, body, key, ip) };
  }
}

/** The donor wall (U-04). Public; short cache so new gifts appear quickly. */
@Controller('public/campaigns')
export class DonorWallController {
  constructor(private readonly donations: DonationsService) {}

  @Get(':slug/donations')
  async wall(
    @Param('slug', { schema: Slug }) slug: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PublicDonationsResponse> {
    res.setHeader('Cache-Control', 'public, max-age=10');
    return this.donations.wall(slug);
  }
}
