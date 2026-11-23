import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Environment configuration, validated once at boot. The app refuses to start with bad config.
 *
 * Development defaults match docker-compose.yml so `pnpm dev` works with no .env file.
 * In production there are NO defaults: every value must be provided (AWS Secrets Manager).
 */
const DEV_DEFAULTS = {
  DATABASE_URL: 'postgres://fundizo:fundizo_dev_only@localhost:5432/fundizo',
  REDIS_URL: 'redis://localhost:6379',
  WEB_BASE_URL: 'http://localhost:3000',
  AUTH_SECRET: 'dev-only-secret-never-use-in-production-0000',
  MAIL_FROM_EMAIL: 'no-reply@fundizo.local',
} as const;

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
    REDIS_URL: z.url({ protocol: /^rediss?$/ }),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    /** Public address of the web app, used for links in emails. */
    WEB_BASE_URL: z.url({ protocol: /^https?$/ }),
    /** Server secret for hashing one-time codes and tokens (HMAC). At least 32 characters. */
    AUTH_SECRET: z.string().min(32),
    /** Express "trust proxy": how many proxies sit in front of the API (Next in dev; ALB + Next in prod). */
    TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(1),
    /** Only false for plain-http local testing tools. Browsers accept Secure cookies on localhost. */
    SESSION_COOKIE_SECURE: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),

    /** Brevo transactional email. Without a key, emails go to the dev outbox (never in production). */
    BREVO_API_KEY: z.string().min(10).optional(),
    MAIL_FROM_EMAIL: z.email(),
    MAIL_FROM_NAME: z.string().min(1).default('Fundizo'),

    /**
     * SMS (A-13). 'outbox' (default) shows texts on /dev/outbox and costs nothing; 'brevo' sends real
     * SMS with Brevo credits. Production must use 'brevo'.
     */
    SMS_TRANSPORT: z.enum(['outbox', 'brevo']).default('outbox'),
    /** Alphanumeric sender name shown on phones: letters and digits only, up to 11 (Brevo rule). */
    SMS_SENDER: z
      .string()
      .regex(/^[A-Za-z0-9]{1,11}$/)
      .default('Fundizo'),

    /** Google sign-in (A-12). Both or neither; without them the "Continue with Google" button is hidden. */
    GOOGLE_CLIENT_ID: z.string().min(10).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(10).optional(),
  })
  .refine((e) => Boolean(e.GOOGLE_CLIENT_ID) === Boolean(e.GOOGLE_CLIENT_SECRET), {
    path: ['GOOGLE_CLIENT_SECRET'],
    message: 'set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither',
  })
  .refine((e) => e.SMS_TRANSPORT !== 'brevo' || e.BREVO_API_KEY, {
    path: ['BREVO_API_KEY'],
    message: 'required when SMS_TRANSPORT=brevo',
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.SMS_TRANSPORT === 'brevo', {
    path: ['SMS_TRANSPORT'],
    message: 'must be brevo in production',
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.BREVO_API_KEY, {
    path: ['BREVO_API_KEY'],
    message: 'required in production',
  })
  .refine((e) => e.NODE_ENV !== 'production' || !e.AUTH_SECRET.startsWith('dev-only'), {
    path: ['AUTH_SECRET'],
    message: 'must be a real secret in production',
  });

export type Env = z.infer<typeof EnvSchema>;

/** DI token for the validated environment. */
export const ENV = Symbol('ENV');

export function parseEnv(source: Record<string, string | undefined>): Env {
  const isProduction = source.NODE_ENV === 'production';
  const input = isProduction ? stripEmpty(source) : { ...DEV_DEFAULTS, ...stripEmpty(source) };
  const result = EnvSchema.safeParse(input);
  if (!result.success) {
    // Name the bad keys, never print their values (they may be secrets).
    const keys = [...new Set(result.error.issues.map((i) => i.path.join('.')))].join(', ');
    throw new Error(`Invalid environment configuration: ${keys}`);
  }
  return result.data;
}

/**
 * Load apps/api/.env except in production and tests, then validate process.env. Tests never read it, so a
 * developer's real keys (Brevo, Google) can't leak into test runs.
 */
export function loadEnv(): Env {
  const file = resolve(import.meta.dirname, '../../.env');
  const mode = process.env.NODE_ENV;
  if (mode !== 'production' && mode !== 'test' && existsSync(file)) {
    process.loadEnvFile(file);
  }
  return parseEnv(process.env);
}

function stripEmpty(source: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ''));
}
