import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import type { DomainEvent, EventDef } from './events.js';

type Handler = (event: DomainEvent<unknown>) => Promise<void>;

interface Registered {
  def: EventDef;
  run: Handler;
}

/**
 * Who reacts to which event. Modules register in `onModuleInit`; each (event, handler) pair becomes
 * its own BullMQ job, so one failing handler retries alone. Handlers MUST be safe to run twice
 * (delivery is at least once).
 */
@Injectable()
export class EventHandlers {
  private readonly byName = new Map<string, Registered>();

  on<S extends z.ZodType>(
    def: EventDef<S>,
    name: string,
    handler: (event: DomainEvent<z.output<S>>) => Promise<void>,
  ): void {
    if (!/^[a-z]+(\.[a-z0-9-]+)+$/.test(name)) throw new Error(`bad handler name "${name}"`);
    if (this.byName.has(name)) throw new Error(`handler "${name}" registered twice`);
    // Parsing here gives the handler its typed payload without a cast (the worker validated it too).
    this.byName.set(name, {
      def,
      run: (e) => handler({ ...e, payload: def.schema.parse(e.payload) }),
    });
  }

  namesFor(type: string): string[] {
    return [...this.byName].filter(([, h]) => h.def.type === type).map(([name]) => name);
  }

  get(name: string): Registered | undefined {
    return this.byName.get(name);
  }
}
