import { Inject, Injectable, Logger } from '@nestjs/common';
import type { DependencyStatus, HealthResponse } from '@fundizo/shared';
import type { Redis } from 'ioredis';
import type pg from 'pg';
import { PG_POOL } from '../../infra/database/database.module.js';
import { ensureConnected, REDIS } from '../../infra/redis/redis.module.js';

const CHECK_TIMEOUT_MS = 2_000;
const VERSION = process.env.npm_package_version ?? '0.1.0';

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async check(): Promise<HealthResponse> {
    const [database, redis] = await Promise.all([
      this.probe('database', async () => {
        await this.pool.query('select 1');
      }),
      this.probe('redis', async () => {
        await ensureConnected(this.redis);
        await this.redis.ping();
      }),
    ]);
    return {
      status: database === 'up' && redis === 'up' ? 'ok' : 'degraded',
      version: VERSION,
      time: new Date().toISOString(),
      checks: { database, redis },
    };
  }

  private async probe(name: string, fn: () => Promise<void>): Promise<DependencyStatus> {
    try {
      await withTimeout(fn(), CHECK_TIMEOUT_MS);
      return 'up';
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      this.logger.warn({ dependency: name, reason }, 'health check failed');
      return 'down';
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
