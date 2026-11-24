import pg from 'pg';
import { migrateDatabase } from '../src/db/migrate.js';
import { testEnv } from './test-env.js';

/** Create the test database if needed, apply all migrations and set up the app login. */
export default async function setup() {
  const { DATABASE_URL, MIGRATION_DATABASE_URL } = testEnv();
  const url = new URL(MIGRATION_DATABASE_URL);
  const dbName = url.pathname.slice(1);
  if (!dbName.endsWith('_test')) throw new Error(`Refusing to run tests against "${dbName}"`);

  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  const exists = await client.query('select 1 from pg_database where datname = $1', [dbName]);
  if (exists.rowCount === 0) await client.query(`create database "${dbName}"`);
  await client.end();

  await migrateDatabase({
    migrationUrl: MIGRATION_DATABASE_URL,
    appUrl: DATABASE_URL,
    production: false,
  });
}
