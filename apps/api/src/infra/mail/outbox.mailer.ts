import { Logger } from '@nestjs/common';
import { z } from 'zod';
import type { Redis } from 'ioredis';
import { ensureConnected } from '../redis/redis.module.js';
import type { Mailer, MailMessage } from './mailer.js';

export const OUTBOX_KEY = 'dev:mail-outbox';
const KEEP = 50;

export const OutboxEntry = z.object({
  id: z.string(),
  sentAt: z.string(),
  to: z.object({ email: z.string(), name: z.string().optional() }),
  subject: z.string(),
  text: z.string(),
  html: z.string(),
  tag: z.string(),
});
export type OutboxEntry = z.infer<typeof OutboxEntry>;

export function parseOutbox(raw: string[]): OutboxEntry[] {
  return raw.flatMap((r) => {
    const parsed = OutboxEntry.safeParse(JSON.parse(r));
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Development/test mailer: keeps the last 50 emails in Redis so they can be read on the
 * /dev/outbox page and in tests. Never used in production (config refuses to start without Brevo).
 */
export class OutboxMailer implements Mailer {
  private readonly logger = new Logger(OutboxMailer.name);

  constructor(private readonly redis: Redis) {}

  async send(message: MailMessage): Promise<void> {
    const entry: OutboxEntry = {
      ...message,
      id: crypto.randomUUID(),
      sentAt: new Date().toISOString(),
    };
    await ensureConnected(this.redis);
    await this.redis
      .multi()
      .lpush(OUTBOX_KEY, JSON.stringify(entry))
      .ltrim(OUTBOX_KEY, 0, KEEP - 1)
      .exec();
    this.logger.log({ tag: message.tag }, 'email captured in dev outbox (no BREVO_API_KEY set)');
  }

  async list(): Promise<OutboxEntry[]> {
    await ensureConnected(this.redis);
    const raw = await this.redis.lrange(OUTBOX_KEY, 0, KEEP - 1);
    return parseOutbox(raw);
  }
}
