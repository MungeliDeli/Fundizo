import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** The current request's id, if we're inside one (used to tag outbox events and their jobs). */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}

/** Ensures every request has an id (shared with pino-http's `req.id`) and makes it reachable. */
export function requestIdFor(req: { id?: unknown }): string {
  const id = typeof req.id === 'string' ? req.id : randomUUID();
  req.id = id;
  return id;
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, _res: Response, next: NextFunction) {
    storage.run({ requestId: requestIdFor(req) }, next);
  }
}
