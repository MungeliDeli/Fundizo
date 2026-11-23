import { Inject, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { ensureConnected, REDIS } from '../infra/redis/redis.module.js';
import { Errors } from './app-error.js';

/** Fixed-window rate limiter in Redis. Keys never contain raw emails (hashed by the caller). */
@Injectable()
export class RateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  /** Count one hit; throw `rate_limited` once `limit` hits happen within `windowSeconds`. */
  async consume(key: string, limit: number, windowSeconds: number): Promise<void> {
    await ensureConnected(this.redis);
    const fullKey = `rl:${key}`;
    const results = await this.redis
      .multi()
      .incr(fullKey)
      .expire(fullKey, windowSeconds, 'NX')
      .ttl(fullKey)
      .exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    const ttl = Number(results?.[2]?.[1] ?? windowSeconds);
    if (count > limit) throw Errors.rateLimited(Math.max(1, ttl));
  }
}
