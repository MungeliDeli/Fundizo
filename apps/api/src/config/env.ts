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
} as const;

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Env = z.infer<typeof EnvSchema>;

/** DI token for the validated environment. */
export const ENV = Symbol('ENV');

export function parseEnv(source: Record<string, string | undefined>): Env {
  const isProduction = source.NODE_ENV === 'production';
  const input = isProduction ? source : { ...DEV_DEFAULTS, ...stripEmpty(source) };
  const result = EnvSchema.safeParse(input);
  if (!result.success) {
    // Name the bad keys, never print their values (they may be secrets).
    const keys = result.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment configuration: ${keys}`);
  }
  return result.data;
}

/** Load apps/api/.env in development if present, then validate process.env. */
export function loadEnv(): Env {
  const file = resolve(import.meta.dirname, '../../.env');
  if (process.env.NODE_ENV !== 'production' && existsSync(file)) {
    process.loadEnvFile(file);
  }
  return parseEnv(process.env);
}

function stripEmpty(source: Record<string, string | undefined>) {
  return Object.fromEntries(Object.entries(source).filter(([, v]) => v !== undefined && v !== ''));
}
