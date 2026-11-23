import { Controller, Get, Inject, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MAILER, type Mailer } from '../../infra/mail/mailer.js';
import { OutboxMailer, type OutboxEntry } from '../../infra/mail/outbox.mailer.js';
import { MESSAGING, type Messaging } from '../../infra/sms/messaging.js';
import { OutboxSms, type SmsOutboxEntry } from '../../infra/sms/outbox.sms.js';

interface DevOutbox {
  /** Emails: 'outbox' when no BREVO_API_KEY is set, otherwise they went to real inboxes. */
  transport: 'outbox' | 'brevo';
  messages: OutboxEntry[];
  sms: { transport: 'outbox' | 'brevo'; messages: SmsOutboxEntry[] };
}

/**
 * Development-only helpers. This module is NOT loaded when NODE_ENV=production (see AppModule),
 * so these routes don't exist there.
 */
@Controller('dev')
export class DevController {
  constructor(
    @Inject(MAILER) private readonly mailer: Mailer,
    @Inject(MESSAGING) private readonly messaging: Messaging,
  ) {}

  /** The last 50 emails and 50 texts that would have been sent. */
  @Get('outbox')
  async outbox(@Res({ passthrough: true }) res: Response): Promise<DevOutbox> {
    res.setHeader('Cache-Control', 'no-store');
    const emails = this.mailer instanceof OutboxMailer ? await this.mailer.list() : null;
    const texts = this.messaging instanceof OutboxSms ? await this.messaging.list() : null;
    return {
      transport: emails ? 'outbox' : 'brevo',
      messages: emails ?? [],
      sms: { transport: texts ? 'outbox' : 'brevo', messages: texts ?? [] },
    };
  }
}
