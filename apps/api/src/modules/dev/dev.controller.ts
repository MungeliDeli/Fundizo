import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MAILER, type Mailer } from '../../infra/mail/mailer.js';
import { OutboxMailer, type OutboxEntry } from '../../infra/mail/outbox.mailer.js';

/**
 * Development-only helpers. This module is NOT loaded when NODE_ENV=production (see AppModule),
 * so these routes don't exist there.
 */
@Controller('dev')
export class DevController {
  constructor(@Inject(MAILER) private readonly mailer: Mailer) {}

  /** The last 50 emails, when no BREVO_API_KEY is set. */
  @Get('outbox')
  async outbox(
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ transport: 'outbox' | 'brevo'; messages: OutboxEntry[] }> {
    res.setHeader('Cache-Control', 'no-store');
    if (this.mailer instanceof OutboxMailer)
      return { transport: 'outbox', messages: await this.mailer.list() };
    return { transport: 'brevo', messages: [] };
  }
}
