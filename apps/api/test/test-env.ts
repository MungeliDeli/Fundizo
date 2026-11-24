import { DEV_APP_URL, DEV_MIGRATION_URL } from '../src/db/migrate.js';

/** Test database and Redis addresses, derived from the dev/CI ones. Used by vitest.config and global setup. */
function toTest(base: string) {
  const url = new URL(base);
  if (!url.pathname.endsWith('_test')) url.pathname = `${url.pathname}_test`;
  return url.toString();
}

export function testEnv() {
  const redis = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  redis.pathname = '/15';
  return {
    /** The API's least-privilege login, as in every other environment. */
    DATABASE_URL: toTest(process.env.DATABASE_URL ?? DEV_APP_URL),
    /** The owner: runs migrations and wipes data between test files. */
    MIGRATION_DATABASE_URL: toTest(process.env.MIGRATION_DATABASE_URL ?? DEV_MIGRATION_URL),
    REDIS_URL: redis.toString(),
  };
}
