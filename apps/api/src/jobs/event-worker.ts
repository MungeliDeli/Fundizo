import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Job, UnrecoverableError, Worker } from 'bullmq';
import { eq } from 'drizzle-orm';
import { ENV, type Env } from '../config/env.js';
import { outboxEvents } from '../db/schema/index.js';
import { DB, type Database } from '../infra/database/database.module.js';
import { EventHandlers } from './event-handlers.js';
import { BULL_PREFIX, EVENTS_QUEUE, EventJob, bullConnection } from './queue.js';

/**
 * Runs event handlers (F-09). Every job is validated, its event re-read from Postgres and its
 * payload re-validated before the handler sees it (CLAUDE.md: validate queue payloads). A thrown
 * error retries with backoff; a malformed job fails at once (UnrecoverableError) instead.
 */
@Injectable()
export class EventWorker implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(EventWorker.name);
  private worker: Worker<EventJob> | null = null;

  constructor(
    @Inject(DB) private readonly db: Database,
    @Inject(ENV) private readonly env: Env,
    private readonly handlers: EventHandlers,
  ) {}

  onApplicationBootstrap() {
    if (!this.env.JOBS_ENABLED) return;
    this.worker = new Worker<EventJob>(EVENTS_QUEUE, (job) => this.process(job), {
      connection: bullConnection(this.env),
      prefix: BULL_PREFIX,
      concurrency: 5,
    });
    this.worker.on('failed', (job, err) => {
      if (!job) return;
      const final =
        job.attemptsMade >= (job.opts.attempts ?? 1) || err instanceof UnrecoverableError;
      const fields = { jobId: job.id, handler: job.data.handler, attempt: job.attemptsMade, err };
      if (final) this.log.error(fields, 'job failed for good');
      else this.log.warn(fields, 'job failed; will retry');
    });
    this.worker.on('error', (err) => this.log.warn({ err }, 'worker connection problem'));
  }

  async onApplicationShutdown() {
    await this.worker?.close();
  }

  async process(job: Pick<Job<unknown>, 'data' | 'attemptsMade'>): Promise<void> {
    const data = EventJob.safeParse(job.data);
    if (!data.success) throw new UnrecoverableError('malformed job data');
    const handler = this.handlers.get(data.data.handler);
    if (!handler) throw new UnrecoverableError(`no handler "${data.data.handler}"`);

    const [row] = await this.db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.id, data.data.eventId));
    if (!row) throw new UnrecoverableError('event not found');
    if (row.type !== handler.def.type) throw new UnrecoverableError('handler/event type mismatch');
    const payload = handler.def.schema.safeParse(row.payload);
    if (!payload.success) throw new UnrecoverableError(`invalid ${row.type} payload`);

    const ctx = {
      eventId: row.id,
      type: row.type,
      handler: data.data.handler,
      correlationId: row.correlationId,
    };
    const started = Date.now();
    await handler.run({
      id: row.id,
      type: row.type,
      payload: payload.data,
      correlationId: row.correlationId,
      createdAt: row.createdAt,
    });
    this.log.log(
      { ...ctx, attempt: job.attemptsMade + 1, ms: Date.now() - started },
      'event handled',
    );
  }
}
