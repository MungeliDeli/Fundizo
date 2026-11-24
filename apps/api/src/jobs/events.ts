import type { z } from 'zod';

/**
 * A domain event type (F-09): a name and a strict Zod schema for its payload. Each module defines
 * the events it publishes in its own `events.ts`. Payloads carry ids only, never personal data,
 * because they sit in the database and pass through Redis.
 */
export interface EventDef<S extends z.ZodType = z.ZodType> {
  type: string;
  schema: S;
}

export function defineEvent<S extends z.ZodType>(type: string, schema: S): EventDef<S> {
  if (!/^[a-z]+(\.[a-z_]+)+$/.test(type)) throw new Error(`bad event type "${type}"`);
  return { type, schema };
}

/** What a handler receives. */
export interface DomainEvent<T> {
  id: string;
  type: string;
  payload: T;
  correlationId: string | null;
  createdAt: Date;
}
