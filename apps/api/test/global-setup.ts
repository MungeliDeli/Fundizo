import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { testEnv } from './test-env.js';

/** Create the test database if needed and apply all migrations to it. */
export default async function setup() {
  const url = new URL(testEnv().DATABASE_URL);
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error(`Refusing to run tests against "${dbName}"`);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query('select 1 from pg_database where datname = $1', [dbName]);
  if (exists.rowCount === 0) await client.query(`create database "${dbName}"`);
  await client.end();

  const pool = new pg.Pool({ connectionString: url.toString() });
  await migrate(drizzle(pool), {
    migrationsFolder: new URL('../src/db/migrations', import.meta.url).pathname,
  });
  await pool.end();
}
