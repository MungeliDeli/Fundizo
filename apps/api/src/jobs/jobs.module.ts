import { Global, Module } from '@nestjs/common';
import { DelayedJobs } from './delayed-jobs.js';
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
  providers: [OutboxService, EventHandlers, OutboxRelay, EventWorker, DelayedJobs],
  exports: [OutboxService, EventHandlers, OutboxRelay, EventWorker, DelayedJobs],
})
export class JobsModule {}
