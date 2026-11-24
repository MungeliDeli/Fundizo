import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

/**
 * `pnpm db:migrate`: apply migrations as the database OWNER, then (outside production) make sure the
 * API's own login exists and is a member of `fundizo_app`.
 *
 * Why two logins: the API connects with least privilege. It has no UPDATE/DELETE on the ledger and
 * can't change the schema (CLAUDE.md, least privilege; money rule 3). In AWS the app login is created
 * by infrastructure with a password from Secrets Manager, so production never runs the role step here.
 *
 * Self-contained (no relative imports) so plain `node` can run it with built-in TypeScript support.
 */
export const DEV_MIGRATION_URL = 'postgres://fundizo:fundizo_dev_only@localhost:5432/fundizo';
export const DEV_APP_URL = 'postgres://fundizo_api:fundizo_api_dev_only@localhost:5432/fundizo';

export async function migrateDatabase(opts: {
  migrationUrl: string;
  appUrl: string;
  production: boolean;
}): Promise<void> {
  const pool = new pg.Pool({ connectionString: opts.migrationUrl, max: 1 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: new URL('./migrations', import.meta.url).pathname,
    });
    if (!opts.production) await ensureAppLogin(pool, opts.migrationUrl, opts.appUrl);
  } finally {
    await pool.end();
  }
}

/** Create or refresh the API's login (dev, test and CI only) and put it in the fundizo_app group. */
async function ensureAppLogin(pool: pg.Pool, migrationUrl: string, appUrl: string) {
  const app = new URL(appUrl);
  const owner = new URL(migrationUrl);
  const user = decodeURIComponent(app.username);
  const password = decodeURIComponent(app.password);
  if (!user || user === decodeURIComponent(owner.username)) {
    throw new Error(
      'DATABASE_URL must use the app login (e.g. fundizo_api), not the owner that runs migrations',
    );
  }
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(user)) throw new Error('Unexpected app login name');
  const client = await pool.connect();
  try {
    const exists = await client.query('select 1 from pg_roles where rolname = $1', [user]);
    // Identifiers can't be parameters; the name was checked above and the password is quoted by Postgres.
    const quoted = (await client.query<{ q: string }>('select quote_literal($1) as q', [password]))
      .rows[0]?.q;
    if (!quoted) throw new Error('Could not quote the password');
    if (exists.rowCount === 0) {
      await client.query(`create role ${user} login password ${quoted} in role fundizo_app`);
    } else {
      await client.query(`alter role ${user} with login password ${quoted}`);
      await client.query(`grant fundizo_app to ${user}`);
    }
  } finally {
    client.release();
  }
}

if (import.meta.main) {
  const production = process.env.NODE_ENV === 'production';
  const migrationUrl =
    process.env.MIGRATION_DATABASE_URL ?? (production ? undefined : DEV_MIGRATION_URL);
  const appUrl = process.env.DATABASE_URL ?? DEV_APP_URL;
  if (!migrationUrl) throw new Error('MIGRATION_DATABASE_URL is required in production');
  await migrateDatabase({ migrationUrl, appUrl, production });
  console.log('Migrations applied.');
}
