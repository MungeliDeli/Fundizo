import { Logger } from '@nestjs/common';
import { maskPhone } from '@fundizo/shared';
import { z } from 'zod';
import type { Messaging, SmsMessage } from './messaging.js';

const BREVO_SMS_URL = 'https://api.brevo.com/v3/transactionalSMS/sms';
const TIMEOUT_MS = 10_000;
const SendResponse = z.object({
  messageId: z.union([z.number(), z.string()]).optional(),
  remainingCredits: z.number().optional(),
});

/** Brevo transactional SMS (ADR 0002). Logs the masked number and tag only, never the text. */
export class BrevoSms implements Messaging {
  private readonly logger = new Logger(BrevoSms.name);

  constructor(
    private readonly apiKey: string,
    private readonly sender: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async send(message: SmsMessage): Promise<void> {
    const res = await this.fetchImpl(BREVO_SMS_URL, {
      method: 'POST',
      headers: {
        'api-key': this.apiKey,
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body: JSON.stringify({
        sender: this.sender,
        recipient: message.to.replace(/^\+/, ''),
        content: message.text,
        type: 'transactional',
        tag: message.tag,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status !== 201) {
      // 402 = out of SMS credits. Brevo's error body has a code and message, no secrets.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`Brevo SMS failed with ${res.status}: ${detail}`);
    }
    const body = SendResponse.safeParse(await res.json().catch(() => ({})));
    this.logger.log(
      {
        tag: message.tag,
        to: maskPhone(message.to),
        messageId: body.data?.messageId,
        remainingCredits: body.data?.remainingCredits,
      },
      'sms sent',
    );
  }
}
