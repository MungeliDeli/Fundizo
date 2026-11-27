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
  // The API's least-privilege login (src/db/migrate.ts creates it in dev); migrations use the owner.
  DATABASE_URL: 'postgres://fundizo_api:fundizo_api_dev_only@localhost:5432/fundizo',
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

    /**
     * Where processed photos are stored (C-05). 'local' = a git-ignored folder, served by the API in
     * development. 's3' arrives with AWS (slice 7); production refuses to start until then.
     */
    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_DIR: z.string().min(1).default('.storage'),
    /** Public base URL for photos (the CDN in production). Defaults to the relative /media (proxied to the API in dev). */
    MEDIA_PUBLIC_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),

    /**
     * Background jobs (F-09): the outbox relay and the BullMQ worker run inside the API process when
     * true. Tests turn them off unless they test jobs; a separate worker service can come later.
     */
    JOBS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
    /** How often the relay looks for new outbox events, in milliseconds. */
    OUTBOX_POLL_MS: z.coerce.number().int().min(10).max(60_000).default(500),
    /** First retry delay for a failed job; doubles each try (8 tries ≈ 10 minutes at 5 s). */
    JOBS_RETRY_DELAY_MS: z.coerce.number().int().min(10).max(600_000).default(5_000),

    /**
     * Mobile money (D-06/D-07). 'fake' = a pretend network you play from /dev/payments (no money
     * moves). 'zynle' = ZynlePay sandbox, arriving in slice 8. Production refuses 'fake'.
     */
    PAYMENT_PROVIDER: z.enum(['fake', 'zynle']).default('fake'),
    /**
     * ZynlePay (ADR 0002, slice 8). Required when PAYMENT_PROVIDER=zynle. Outside production only the
     * sandbox host is allowed (CLAUDE.md: never call live payment endpoints from dev or CI).
     */
    ZYNLE_BASE_URL: z
      .url({ protocol: /^https$/ })
      .default('https://sandbox.zynlepay.com/zynlepay/jsonapi'),
    /** Status-check endpoint; defaults to <ZYNLE_BASE_URL>/paymentstatus. */
    ZYNLE_STATUS_URL: z.url({ protocol: /^https$/ }).optional(),
    ZYNLE_MERCHANT_ID: z.string().min(1).max(64).optional(),
    ZYNLE_API_ID: z.string().min(1).max(256).optional(),
    ZYNLE_API_KEY: z.string().min(1).max(512).optional(),
    /** Secret last segment of our callback URL: ZynlePay doesn't sign callbacks. */
    ZYNLE_CALLBACK_TOKEN: z
      .string()
      .regex(/^[A-Za-z0-9_-]{24,128}$/)
      .optional(),
    /**
     * What ZynlePay's integer `amount` means. Deliberately no default: guessing wrong charges 100×
     * too much or too little. Confirm with ZynlePay, then set it.
     */
    ZYNLE_AMOUNT_UNIT: z.enum(['kwacha', 'ngwee']).optional(),
    /** How phone numbers are sent: 'international' = 260971234567, 'local' = 0971234567. */
    ZYNLE_PHONE_FORMAT: z.enum(['international', 'local']).default('international'),
    /** Network fee from ZynlePay's rate card, in basis points (200 = 2%). Recorded in the ledger. */
    ZYNLE_FEE_BASIS_POINTS: z.coerce.number().int().min(0).max(1_000).default(0),
    /** When to ask the provider for a payment's status, in ms after the prompt (money rule 8). */
    PAYMENT_STATUS_CHECKS_MS: z
      .string()
      .regex(/^\d+(,\d+)*$/)
      .default('10000,30000,60000,120000,300000')
      .transform((v) => v.split(',').map(Number)),

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
  .refine(
    (e) =>
      e.PAYMENT_PROVIDER !== 'zynle' ||
      Boolean(e.ZYNLE_MERCHANT_ID && e.ZYNLE_API_ID && e.ZYNLE_API_KEY && e.ZYNLE_CALLBACK_TOKEN),
    {
      path: ['ZYNLE_API_KEY'],
      message:
        'PAYMENT_PROVIDER=zynle needs ZYNLE_MERCHANT_ID, ZYNLE_API_ID, ZYNLE_API_KEY and ZYNLE_CALLBACK_TOKEN',
    },
  )
  .refine((e) => e.PAYMENT_PROVIDER !== 'zynle' || e.ZYNLE_AMOUNT_UNIT, {
    path: ['ZYNLE_AMOUNT_UNIT'],
    message: 'set to kwacha or ngwee once ZynlePay confirms what `amount` means',
  })
  .refine(
    (e) =>
      e.NODE_ENV === 'production' ||
      [e.ZYNLE_BASE_URL, e.ZYNLE_STATUS_URL].every(
        (u) => !u || new URL(u).hostname === 'sandbox.zynlepay.com',
      ),
    {
      path: ['ZYNLE_BASE_URL'],
      message: 'only the ZynlePay sandbox is allowed outside production',
    },
  )
  .refine((e) => e.NODE_ENV !== 'production' || e.PAYMENT_PROVIDER !== 'fake', {
    path: ['PAYMENT_PROVIDER'],
    message: 'the fake provider is for development only',
  })
  .refine((e) => e.NODE_ENV !== 'production' || e.STORAGE_DRIVER === 's3', {
    path: ['STORAGE_DRIVER'],
    message: 'must be s3 in production',
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
