import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { Redis } from 'ioredis';
import { ENV, type Env } from '../../config/env.js';

export const REDIS = Symbol('REDIS');

/** The client connects lazily; call before commands that must not be dropped. */
export async function ensureConnected(redis: Redis) {
  if (redis.status === 'wait' || redis.status === 'end') await redis.connect();
}

/** Shared Redis client (cache, rate limits, and the BullMQ connection later). */
@Global()
@Module({
  providers: [
    {
      provide: REDIS,
      inject: [ENV],
      useFactory: (env: Env) =>
        new Redis(env.REDIS_URL, {
          lazyConnect: true,
          // Fail fast instead of queueing commands forever when Redis is down.
          maxRetriesPerRequest: 1,
          enableOfflineQueue: false,
          connectTimeout: 3_000,
          connectionName: 'fundizo-api',
        }),
    },
  ],
  exports: [REDIS],
})
export class RedisModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    this.redis.disconnect();
  }
}
