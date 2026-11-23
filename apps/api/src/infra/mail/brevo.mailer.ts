import { Logger } from '@nestjs/common';
import { z } from 'zod';
import type { Mailer, MailMessage } from './mailer.js';

const BREVO_SEND_URL = 'https://api.brevo.com/v3/smtp/email';
const TIMEOUT_MS = 10_000;
const BrevoSendResponse = z.object({ messageId: z.string().optional() });

/** Brevo transactional email (ADR 0002). Logs the message id and tag, never the content. */
export class BrevoMailer implements Mailer {
  private readonly logger = new Logger(BrevoMailer.name);

  constructor(
    private readonly apiKey: string,
    private readonly from: { email: string; name: string },
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: MailMessage): Promise<void> {
    const res = await this.fetchImpl(BREVO_SEND_URL, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: this.from,
        to: [message.to],
        subject: message.subject,
        htmlContent: message.html,
        textContent: message.text,
        tags: [message.tag],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status !== 201 && res.status !== 202) {
      // Brevo's error body has a code + message, no secrets; keep it short in logs.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`Brevo send failed with ${res.status}: ${detail}`);
    }
    const body = BrevoSendResponse.safeParse(await res.json().catch(() => ({})));
    this.logger.log({ tag: message.tag, messageId: body.data?.messageId }, 'email sent');
  }
}
