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
    PAYMENT_PROVIDER: 'zynle',
    ZYNLE_BASE_URL: 'https://payments.zynlepay.com/zynlepay/jsonapi',
    ZYNLE_MERCHANT_ID: 'm-1',
    ZYNLE_API_ID: 'api-id',
    ZYNLE_API_KEY: 'api-key',
    ZYNLE_CALLBACK_TOKEN: 'cb-token-0123456789abcdef0123',
    ZYNLE_AMOUNT_UNIT: 'kwacha',
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

  it('never uses the pretend payment provider in production', () => {
    expect(() => parseEnv({ ...production, PAYMENT_PROVIDER: 'fake' })).toThrow(/PAYMENT_PROVIDER/);
  });

  describe('ZynlePay', () => {
    const sandbox = {
      PAYMENT_PROVIDER: 'zynle',
      ZYNLE_MERCHANT_ID: 'm-1',
      ZYNLE_API_ID: 'api-id',
      ZYNLE_API_KEY: 'api-key',
      ZYNLE_CALLBACK_TOKEN: 'cb-token-0123456789abcdef0123',
      ZYNLE_AMOUNT_UNIT: 'kwacha',
    };

    it('works in development against the sandbox', () => {
      expect(parseEnv(sandbox).ZYNLE_BASE_URL).toBe(
        'https://sandbox.zynlepay.com/zynlepay/jsonapi',
      );
    });

    it('needs every credential and the callback token', () => {
      expect(() => parseEnv({ ...sandbox, ZYNLE_API_KEY: '' })).toThrow(/ZYNLE_API_KEY/);
      expect(() => parseEnv({ ...sandbox, ZYNLE_CALLBACK_TOKEN: '' })).toThrow(/ZYNLE_API_KEY/);
    });

    it('refuses to guess what `amount` means', () => {
      expect(() => parseEnv({ ...sandbox, ZYNLE_AMOUNT_UNIT: '' })).toThrow(/ZYNLE_AMOUNT_UNIT/);
    });

    it('never calls the live ZynlePay from dev or CI', () => {
      expect(() =>
        parseEnv({ ...sandbox, ZYNLE_BASE_URL: 'https://payments.zynlepay.com/zynlepay/jsonapi' }),
      ).toThrow(/ZYNLE_BASE_URL/);
      expect(() =>
        parseEnv({
          ...sandbox,
          ZYNLE_STATUS_URL: 'https://payments.zynlepay.com/zynlepay/paymentstatus',
        }),
      ).toThrow(/ZYNLE_BASE_URL/);
    });
  });

  it('reads the payment status-check schedule', () => {
    expect(parseEnv({}).PAYMENT_STATUS_CHECKS_MS).toEqual([
      10_000, 30_000, 60_000, 120_000, 300_000,
    ]);
    expect(() => parseEnv({ PAYMENT_STATUS_CHECKS_MS: '10s' })).toThrow(/PAYMENT_STATUS_CHECKS_MS/);
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
