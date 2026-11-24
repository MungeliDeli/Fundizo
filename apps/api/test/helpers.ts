import { rm } from 'node:fs/promises';
import sharp from 'sharp';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { CSRF_HEADER } from '@fundizo/shared';
import { Redis } from 'ioredis';
import pg from 'pg';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { OUTBOX_KEY, type OutboxEntry, parseOutbox } from '../src/infra/mail/outbox.mailer.js';
import {
  SMS_OUTBOX_KEY,
  type SmsOutboxEntry,
  parseSmsOutbox,
} from '../src/infra/sms/outbox.sms.js';

export async function createTestApp(customise: (b: TestingModuleBuilder) => void = () => {}) {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  customise(builder);
  const moduleRef = await builder.compile();
  const app: INestApplication<App> = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}

/** Wipe test data between files. Guarded so it can only ever run against *_test / Redis DB 15. */
export async function resetData() {
  const dbUrl = process.env.MIGRATION_DATABASE_URL ?? '';
  const redisUrl = process.env.REDIS_URL ?? '';
  if (!new URL(dbUrl).pathname.endsWith('_test') || !redisUrl.endsWith('/15')) {
    throw new Error('resetData refused: not a test database');
  }
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  // The ledger refuses TRUNCATE even from its owner (append-only trigger). Tests are the one place
  // that wipes it, so triggers are switched off for this session only (needs the owner/superuser).
  await client.query(`set session_replication_role = replica`);
  await client.query(
    'truncate users, sessions, one_time_tokens, user_identities, campaigns, campaign_beneficiaries, campaign_media, ledger_entries, ledger_transactions, ledger_accounts, outbox_events cascade',
  );
  await client.end();
  const redis = new Redis(redisUrl);
  await redis.flushdb();
  redis.disconnect();
  const storage = process.env.STORAGE_LOCAL_DIR ?? '';
  if (storage.includes('fundizo-test-storage')) await rm(storage, { recursive: true, force: true });
}

/** A real JPEG, made in memory (with EXIF, so tests can prove it's stripped). */
export async function testJpeg(width = 1200, height = 900): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 180, g: 83, b: 42 } } })
    .jpeg()
    .withExif({
      IFD0: { Make: 'TestPhone' },
      IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '14/1 26/1 0/1' },
    })
    .toBuffer();
}

/** Read the dev outbox (newest first). */
export async function outbox(): Promise<OutboxEntry[]> {
  const redis = new Redis(process.env.REDIS_URL ?? '');
  const raw = await redis.lrange(OUTBOX_KEY, 0, -1);
  redis.disconnect();
  return parseOutbox(raw);
}

export async function lastEmailTo(email: string): Promise<OutboxEntry | undefined> {
  return (await outbox()).find((m) => m.to.email === email);
}

/** Texts captured by the dev SMS outbox (newest first). */
export async function smsOutbox(): Promise<SmsOutboxEntry[]> {
  const redis = new Redis(process.env.REDIS_URL ?? '');
  const raw = await redis.lrange(SMS_OUTBOX_KEY, 0, -1);
  redis.disconnect();
  return parseSmsOutbox(raw);
}

export async function lastSmsTo(phone: string): Promise<SmsOutboxEntry | undefined> {
  return (await smsOutbox()).find((m) => m.to === phone);
}

export function codeFrom(mail: { text: string } | undefined): string {
  const code = mail?.text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error('no code in email');
  return code;
}

export function tokenFrom(mail: OutboxEntry | undefined): string {
  const token = mail?.text.match(/token=([\w-]+)/)?.[1];
  if (!token) throw new Error('no token in email');
  return token;
}

/** A supertest agent that keeps cookies (like a browser) and sends the CSRF header. */
export function browser(app: INestApplication<App>) {
  const agent = request.agent(app.getHttpServer());
  return {
    agent,
    post: (path: string, body?: object) =>
      agent
        .post(path)
        .set(CSRF_HEADER, '1')
        .send(body ?? {}),
    get: (path: string) => agent.get(path),
  };
}

export function sessionCookie(res: request.Response): string | undefined {
  const raw: unknown = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? raw.map(String) : typeof raw === 'string' ? [raw] : [];
  return cookies.find((c) => c.startsWith('fz_session='));
}
