/** Test database and Redis addresses, derived from the dev/CI ones. Used by vitest.config and global setup. */
export function testEnv() {
  const baseDb =
    process.env.DATABASE_URL ?? 'postgres://fundizo:fundizo_dev_only@localhost:5432/fundizo';
  const db = new URL(baseDb);
  if (!db.pathname.endsWith('_test')) db.pathname = `${db.pathname}_test`;
  const redis = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379');
  redis.pathname = '/15';
  return { DATABASE_URL: db.toString(), REDIS_URL: redis.toString() };
}
