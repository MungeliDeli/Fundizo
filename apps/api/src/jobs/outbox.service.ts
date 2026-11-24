import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { currentRequestId } from '../common/request-context.js';
import { outboxEvents } from '../db/schema/index.js';
import type { Tx } from '../infra/database/database.module.js';
import type { EventDef } from './events.js';

/**
 * Transactional outbox (F-09). `add` takes the caller's open transaction, so the event exists if and
 * only if the business change committed (CLAUDE.md: never send SMS or call a provider inside a
 * request transaction; write an event instead and let a worker do it).
 */
@Injectable()
export class OutboxService {
  async add<S extends z.ZodType>(tx: Tx, def: EventDef<S>, payload: z.input<S>): Promise<string> {
    const parsed = def.schema.parse(payload);
    const [row] = await tx
      .insert(outboxEvents)
      .values({ type: def.type, payload: parsed, correlationId: currentRequestId() ?? null })
      .returning({ id: outboxEvents.id });
    if (!row) throw new Error('outbox insert failed');
    return row.id;
  }
}
