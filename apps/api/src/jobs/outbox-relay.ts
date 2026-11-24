import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { Queue } from 'bullmq';
import { asc, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { ENV, type Env } from '../config/env.js';
import { outboxEvents } from '../db/schema/index.js';
import { DB, type Database } from '../infra/database/database.module.js';
import { EventHandlers } from './event-handlers.js';
import {
  BULL_PREFIX,
  EVENTS_QUEUE,
  type EventJob,
  bullConnection,
  eventJobOptions,
} from './queue.js';

const BATCH = 100;

export interface JobsStatus {
  enabled: boolean;
  outbox: { waiting: number; relayed: number };
  queue: Record<string, number> | null;
}

/**
 * Moves committed outbox events into BullMQ (F-09). Runs every OUTBOX_POLL_MS. Rows are claimed
 * with FOR UPDATE SKIP LOCKED, so several API instances can relay without double work, and marked
 * relayed in the same transaction. If Redis is down nothing is marked, and the next run retries.
 * The job id is (event, handler), so a re-relay after a crash can't queue a duplicate.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(OutboxRelay.name);
  private queue: Queue<EventJob> | null = null;
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private failing = false;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly handlers: EventHandlers,
  ) {}

  onApplicationBootstrap() {
    if (!this.env.JOBS_ENABLED) return;
    this.queue = new Queue<EventJob>(EVENTS_QUEUE, {
      connection: bullConnection(this.env),
      prefix: BULL_PREFIX,
      defaultJobOptions: eventJobOptions(this.env),
    });
    this.schedule(0);
  }

  async onApplicationShutdown() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.queue?.close();
  }

  /** Relay one batch. Returns how many events were relayed. */
  async relayOnce(): Promise<number> {
    const queue = this.queue;
    if (!queue) return 0;
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: outboxEvents.id, type: outboxEvents.type })
        .from(outboxEvents)
        .where(isNull(outboxEvents.publishedAt))
        .orderBy(asc(outboxEvents.createdAt))
        .limit(BATCH)
        .for('update', { skipLocked: true });
      if (rows.length === 0) return 0;
      const jobs = rows.flatMap((e) =>
        this.handlers.namesFor(e.type).map((handler) => ({
          name: e.type,
          data: { eventId: e.id, handler },
          // BullMQ ignores a job whose id already exists: no duplicate after a crash mid-relay.
          opts: { jobId: `${e.id}.${handler}` },
        })),
      );
      if (jobs.length) await queue.addBulk(jobs);
      await tx
        .update(outboxEvents)
        .set({ publishedAt: sql`now()` })
        .where(
          inArray(
            outboxEvents.id,
            rows.map((r) => r.id),
          ),
        );
      return rows.length;
    });
  }

  async status(): Promise<JobsStatus> {
    const count = async (waiting: boolean) =>
      (
        await this.db
          .select({ n: sql<number>`count(*)::int` })
          .from(outboxEvents)
          .where(waiting ? isNull(outboxEvents.publishedAt) : isNotNull(outboxEvents.publishedAt))
      )[0]?.n ?? 0;
    return {
      enabled: this.env.JOBS_ENABLED,
      outbox: { waiting: await count(true), relayed: await count(false) },
      queue: this.queue
        ? await this.queue.getJobCounts('waiting', 'active', 'delayed', 'completed', 'failed')
        : null,
    };
  }

  private schedule(delay: number) {
    if (this.stopped) return;
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  private async tick() {
    let relayed = 0;
    try {
      relayed = await this.relayOnce();
      if (this.failing) this.log.log('outbox relay recovered');
      this.failing = false;
    } catch (err) {
      // Log once per outage, not every poll.
      if (!this.failing) this.log.warn({ err }, 'outbox relay failed; will retry');
      this.failing = true;
    }
    this.schedule(relayed === BATCH ? 0 : this.env.OUTBOX_POLL_MS);
  }
}
