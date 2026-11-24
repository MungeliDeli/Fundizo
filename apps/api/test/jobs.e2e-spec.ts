import type { INestApplication } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from 'supertest/types.js';
import { ENV, parseEnv } from '../src/config/env.js';
import { outboxEvents } from '../src/db/schema/index.js';
import { DB, type Database } from '../src/infra/database/database.module.js';
import { EventHandlers } from '../src/jobs/event-handlers.js';
import { EventWorker } from '../src/jobs/event-worker.js';
import { defineEvent } from '../src/jobs/events.js';
import { OutboxRelay } from '../src/jobs/outbox-relay.js';
import { OutboxService } from '../src/jobs/outbox.service.js';
import { createTestApp, outbox, resetData } from './helpers.js';
import { publishedCampaign } from './campaign-fixtures.js';

/**
 * Background jobs end to end (F-09): outbox row in the same transaction → relay → BullMQ → handler,
 * with retries, against real Postgres and Redis.
 */
const Ping = defineEvent('test.ping', z.strictObject({ n: z.number().int() }));

let app: INestApplication<App>;
let db: Database;
let outboxService: OutboxService;
const seen: number[] = [];
let failuresLeft = 0;

beforeAll(async () => {
  await resetData();
  app = await createTestApp((b) =>
    b.overrideProvider(ENV).useValue({
      ...parseEnv(process.env),
      JOBS_ENABLED: true,
      OUTBOX_POLL_MS: 20,
      JOBS_RETRY_DELAY_MS: 20,
    }),
  );
  db = app.get(DB);
  outboxService = app.get(OutboxService);
  app.get(EventHandlers).on(Ping, 'test.ping-recorder', async (e) => {
    if (failuresLeft > 0) {
      failuresLeft--;
      throw new Error('temporary failure');
    }
    seen.push(e.payload.n);
  });
});
afterAll(() => app.close());

async function until<T>(check: () => Promise<T | undefined | false>, ms = 10_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out waiting');
    await new Promise((r) => setTimeout(r, 25));
  }
}

it('an event written in a transaction reaches its handler', async () => {
  await db.transaction((tx) => outboxService.add(tx, Ping, { n: 1 }));
  await until(async () => seen.includes(1));
  const [row] = await db.select().from(outboxEvents).where(eq(outboxEvents.type, 'test.ping'));
  expect(row?.publishedAt).not.toBeNull();
});

it('no commit, no event: a rolled-back change never runs its handler', async () => {
  await expect(
    db.transaction(async (tx) => {
      await outboxService.add(tx, Ping, { n: 2 });
      throw new Error('rolled back');
    }),
  ).rejects.toThrow('rolled back');
  await db.transaction((tx) => outboxService.add(tx, Ping, { n: 3 }));
  await until(async () => seen.includes(3));
  expect(seen).not.toContain(2);
});

it('a failing handler is retried until it succeeds', async () => {
  failuresLeft = 2;
  await db.transaction((tx) => outboxService.add(tx, Ping, { n: 4 }));
  await until(async () => seen.includes(4));
  expect(failuresLeft).toBe(0);
  expect(seen.filter((n) => n === 4)).toHaveLength(1);
});

it('payloads are validated before they are written', async () => {
  const bad = { n: 1 };
  Reflect.set(bad, 'n', 'five'); // what a buggy caller could pass at runtime
  await expect(db.transaction((tx) => outboxService.add(tx, Ping, bad))).rejects.toThrow();
});

it('the worker refuses malformed jobs without retrying them', async () => {
  const worker = app.get(EventWorker);
  await expect(worker.process({ data: { nope: 1 }, attemptsMade: 0 })).rejects.toBeInstanceOf(
    UnrecoverableError,
  );
  await expect(
    worker.process({
      data: { eventId: '00000000-0000-4000-8000-000000000000', handler: 'test.ping-recorder' },
      attemptsMade: 0,
    }),
  ).rejects.toBeInstanceOf(UnrecoverableError);
});

it('relaying again never queues a duplicate', async () => {
  const relay = app.get(OutboxRelay);
  const before = seen.length;
  await relay.relayOnce();
  await relay.relayOnce();
  await new Promise((r) => setTimeout(r, 300));
  expect(seen.length).toBe(before);
  const status = await relay.status();
  expect(status.enabled).toBe(true);
  expect(status.outbox.waiting).toBe(0);
});

it('publishing a fundraiser emails the organiser from the worker, with the request id', async () => {
  const { email, title, slug } = await publishedCampaign(app);
  const mail = await until(async () =>
    (await outbox()).find((m) => m.tag === 'fundraiser-live' && m.to.email === email),
  );
  expect(mail.subject).toBe('Your fundraiser is live');
  expect(mail.text).toContain(title);
  expect(mail.text).toContain(`/f/${slug}`);
  const [event] = await db
    .select()
    .from(outboxEvents)
    .where(eq(outboxEvents.type, 'campaign.published'));
  expect(event?.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  // Ids only in the payload: no names, emails or phone numbers.
  expect(Object.keys(z.record(z.string(), z.unknown()).parse(event?.payload))).toEqual([
    'campaignId',
  ]);
});
