import { Global, Module } from '@nestjs/common';
import { EventHandlers } from './event-handlers.js';
import { EventWorker } from './event-worker.js';
import { OutboxRelay } from './outbox-relay.js';
import { OutboxService } from './outbox.service.js';

/**
 * Background jobs (F-09): transactional outbox → relay → BullMQ → event handlers.
 * Modules write events with `OutboxService` and react to them with `EventHandlers.on`.
 */
@Global()
@Module({
  providers: [OutboxService, EventHandlers, OutboxRelay, EventWorker],
  exports: [OutboxService, EventHandlers, OutboxRelay, EventWorker],
})
export class JobsModule {}
