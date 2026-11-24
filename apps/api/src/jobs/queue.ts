import { z } from 'zod';
import type { Env } from '../config/env.js';

/** One queue for domain-event handlers. Payment polling and payouts get their own queues later. */
export const EVENTS_QUEUE = 'events';

/** Job data: ids only. The worker re-reads the event from Postgres (the source of truth). */
export const EventJob = z.strictObject({ eventId: z.uuid(), handler: z.string().min(3).max(100) });
export type EventJob = z.infer<typeof EventJob>;

export function bullConnection(env: Env) {
  // BullMQ needs maxRetriesPerRequest: null so blocking commands survive reconnects.
  return { url: env.REDIS_URL, maxRetriesPerRequest: null, connectionName: 'fundizo-jobs' };
}

export const BULL_PREFIX = 'fundizo';

/** Retries with exponential backoff: 5 s, 10 s, 20 s … about 10 minutes over 8 tries by default. */
export function eventJobOptions(env: Env) {
  return {
    attempts: 8,
    backoff: { type: 'exponential' as const, delay: env.JOBS_RETRY_DELAY_MS },
    removeOnComplete: { age: 24 * 3600, count: 1_000 },
    // Failed jobs stay a week so someone can look at them.
    removeOnFail: { age: 7 * 24 * 3600 },
  };
}
