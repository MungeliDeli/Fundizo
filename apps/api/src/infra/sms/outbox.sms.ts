import { Logger } from '@nestjs/common';
import { maskPhone } from '@fundizo/shared';
import type { Redis } from 'ioredis';
import { z } from 'zod';
import { ensureConnected } from '../redis/redis.module.js';
import type { Messaging, SmsMessage } from './messaging.js';

export const SMS_OUTBOX_KEY = 'dev:sms-outbox';
const KEEP = 50;

export const SmsOutboxEntry = z.object({
  id: z.string(),
  sentAt: z.string(),
  to: z.string(),
  text: z.string(),
  tag: z.string(),
});
export type SmsOutboxEntry = z.infer<typeof SmsOutboxEntry>;

export function parseSmsOutbox(raw: string[]): SmsOutboxEntry[] {
  return raw.flatMap((r) => {
    const parsed = SmsOutboxEntry.safeParse(JSON.parse(r));
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Free SMS stand-in: keeps the last 50 texts in Redis for /dev/outbox and tests. Used until
 * SMS_TRANSPORT=brevo; production refuses to start without Brevo.
 */
export class OutboxSms implements Messaging {
  private readonly logger = new Logger(OutboxSms.name);

  constructor(private readonly redis: Redis) {}

  async send(message: SmsMessage): Promise<void> {
    const entry: SmsOutboxEntry = {
      ...message,
      id: crypto.randomUUID(),
      sentAt: new Date().toISOString(),
    };
    await ensureConnected(this.redis);
    await this.redis
      .multi()
      .lpush(SMS_OUTBOX_KEY, JSON.stringify(entry))
      .ltrim(SMS_OUTBOX_KEY, 0, KEEP - 1)
      .exec();
    this.logger.log(
      { tag: message.tag, to: maskPhone(message.to) },
      'sms captured in dev outbox (SMS_TRANSPORT=outbox)',
    );
  }

  async list(): Promise<SmsOutboxEntry[]> {
    await ensureConnected(this.redis);
    return parseSmsOutbox(await this.redis.lrange(SMS_OUTBOX_KEY, 0, KEEP - 1));
  }
}
