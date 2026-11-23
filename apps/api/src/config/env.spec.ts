import { describe, expect, it } from 'vitest';
import { parseEnv } from './env.js';

describe('parseEnv', () => {
  it('uses safe local defaults in development', () => {
    const env = parseEnv({});
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(4000);
    expect(env.DATABASE_URL).toMatch(/^postgres:\/\/.*localhost/);
  });

  it('has no defaults in production', () => {
    expect(() => parseEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL.*REDIS_URL/);
  });

  it('accepts complete production config', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:p@db.internal:5432/fundizo',
      REDIS_URL: 'rediss://cache.internal:6379',
      PORT: '8080',
    });
    expect(env.PORT).toBe(8080);
  });

  it('rejects bad values without echoing them', () => {
    const bad = { DATABASE_URL: 'mysql://secret-password@host/db' };
    expect(() => parseEnv(bad)).toThrow(/DATABASE_URL/);
    expect(() => parseEnv(bad)).not.toThrow(/secret-password/);
  });
});
