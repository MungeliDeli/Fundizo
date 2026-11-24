import { sql } from 'drizzle-orm';
import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * Transactional outbox (F-09). A domain change and its event row are written in the same database
 * transaction; the relay then hands events to BullMQ. Payloads hold ids, never personal data.
 */
export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    /** The request id that caused it, so logs can be followed from request to job. */
    correlationId: text('correlation_id'),
    /** Set once the relay has queued the event's jobs. Null = waiting. */
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index('outbox_events_waiting')
      .on(t.createdAt)
      .where(sql`${t.publishedAt} is null`),
  ],
);
