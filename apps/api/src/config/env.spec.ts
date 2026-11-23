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

  const production = {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgresql://u:p@db.internal:5432/fundizo',
    REDIS_URL: 'rediss://cache.internal:6379',
    PORT: '8080',
    WEB_BASE_URL: 'https://fundizo.example',
    AUTH_SECRET: 'a-real-production-secret-of-sufficient-length',
    BREVO_API_KEY: 'xkeysib-test-key',
    MAIL_FROM_EMAIL: 'no-reply@fundizo.example',
    SMS_TRANSPORT: 'brevo',
    STORAGE_DRIVER: 's3',
  };

  it('accepts complete production config', () => {
    const env = parseEnv(production);
    expect(env.PORT).toBe(8080);
    expect(env.SESSION_COOKIE_SECURE).toBe(true);
  });

  it('requires Brevo in production (no dev outbox there)', () => {
    expect(() => parseEnv({ ...production, BREVO_API_KEY: '' })).toThrow(/BREVO_API_KEY/);
  });

  it('never uses the free dev SMS outbox in production', () => {
    expect(() => parseEnv({ ...production, SMS_TRANSPORT: 'outbox' })).toThrow(/SMS_TRANSPORT/);
  });

  it('needs a Brevo key before sending real SMS', () => {
    expect(() => parseEnv({ SMS_TRANSPORT: 'brevo' })).toThrow(/BREVO_API_KEY/);
  });

  it('never stores photos on local disk in production', () => {
    expect(() => parseEnv({ ...production, STORAGE_DRIVER: 'local' })).toThrow(/STORAGE_DRIVER/);
  });

  it('refuses the dev secret in production', () => {
    expect(() =>
      parseEnv({ ...production, AUTH_SECRET: 'dev-only-secret-never-use-in-production-0000' }),
    ).toThrow(/AUTH_SECRET/);
  });

  it('rejects bad values without echoing them', () => {
    const bad = { DATABASE_URL: 'mysql://secret-password@host/db' };
    expect(() => parseEnv(bad)).toThrow(/DATABASE_URL/);
    expect(() => parseEnv(bad)).not.toThrow(/secret-password/);
  });
});
