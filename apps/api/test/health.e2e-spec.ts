import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthResponse } from '@fundizo/shared';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { REDIS } from '../src/infra/redis/redis.module.js';

// Integration tests: real Postgres and Redis (docker compose locally, service containers in CI).
async function createApp(
  overrides: (b: ReturnType<typeof Test.createTestingModule>) => void = () => {},
) {
  const builder = Test.createTestingModule({ imports: [AppModule] });
  overrides(builder);
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication({ logger: false });
  await app.init();
  return app;
}

describe('GET /health', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    app = await createApp();
  });
  afterAll(async () => app.close());

  it('reports ok when Postgres and Redis are reachable', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    const body = HealthResponse.parse(res.body);
    expect(body).toMatchObject({ status: 'ok', checks: { database: 'up', redis: 'up' } });
    expect(res.headers['cache-control']).toBe('no-store');
  });
});

describe('GET /health with Redis down', () => {
  let app: INestApplication<App>;
  beforeAll(async () => {
    const brokenRedis = {
      status: 'ready',
      ping: () => Promise.reject(new Error('connection refused')),
      disconnect: () => {},
    };
    app = await createApp((b) => b.overrideProvider(REDIS).useValue(brokenRedis));
  });
  afterAll(async () => app.close());

  it('returns 503 and names the failing dependency', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(503);
    expect(HealthResponse.parse(res.body)).toMatchObject({
      status: 'degraded',
      checks: { database: 'up', redis: 'down' },
    });
  });
});
