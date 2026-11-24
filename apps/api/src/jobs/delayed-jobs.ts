import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { type Job, Queue, UnrecoverableError, Worker } from 'bullmq';
import { z } from 'zod';
import { ENV, type Env } from '../config/env.js';
import { BULL_PREFIX, bullConnection, eventJobOptions } from './queue.js';

const DELAYED_QUEUE = 'delayed';
const Envelope = z.strictObject({ task: z.string().min(3).max(100), data: z.unknown() });

interface Task {
  schema: z.ZodType;
  run: (data: unknown) => Promise<void>;
}

/**
 * Work that must happen LATER, e.g. payment status checks at 10 s, 30 s, 1 min… (F-09, D-09).
 * Tasks register with a Zod schema; data is validated when scheduled and again when run. A job id
 * makes scheduling idempotent. When JOBS_ENABLED=false nothing is queued (tests drive tasks directly).
 * Use the outbox, not this, for anything that must follow a database change atomically.
 */
@Injectable()
export class DelayedJobs implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(DelayedJobs.name);
  private readonly tasks = new Map<string, Task>();
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(@Inject(ENV) private readonly env: Env) {}

  register<S extends z.ZodType>(
    task: string,
    schema: S,
    run: (data: z.output<S>) => Promise<void>,
  ) {
    if (this.tasks.has(task)) throw new Error(`task "${task}" registered twice`);
    this.tasks.set(task, { schema, run: (d) => run(schema.parse(d)) });
  }

  async schedule(task: string, data: unknown, opts: { delayMs: number; jobId: string }) {
    const t = this.tasks.get(task);
    if (!t) throw new Error(`unknown task "${task}"`);
    t.schema.parse(data);
    if (!this.queue) return;
    await this.queue.add(
      task,
      { task, data },
      { delay: Math.max(0, opts.delayMs), jobId: opts.jobId },
    );
  }

  onApplicationBootstrap() {
    if (!this.env.JOBS_ENABLED) return;
    const connection = bullConnection(this.env);
    this.queue = new Queue(DELAYED_QUEUE, {
      connection,
      prefix: BULL_PREFIX,
      defaultJobOptions: eventJobOptions(this.env),
    });
    this.worker = new Worker(DELAYED_QUEUE, (job: Job) => this.process(job.data), {
      connection,
      prefix: BULL_PREFIX,
      concurrency: 10,
    });
    this.worker.on('failed', (job, err) => {
      if (job)
        this.log.warn({ jobId: job.id, attempt: job.attemptsMade, err }, 'delayed job failed');
    });
    this.worker.on('error', (err) => this.log.warn({ err }, 'delayed worker connection problem'));
  }

  async onApplicationShutdown() {
    await this.worker?.close();
    await this.queue?.close();
  }

  async process(raw: unknown): Promise<void> {
    const env = Envelope.safeParse(raw);
    if (!env.success) throw new UnrecoverableError('malformed delayed job');
    const t = this.tasks.get(env.data.task);
    if (!t) throw new UnrecoverableError(`no task "${env.data.task}"`);
    if (!t.schema.safeParse(env.data.data).success)
      throw new UnrecoverableError('invalid task data');
    await t.run(env.data.data);
  }
}
