import { defineConfig } from 'drizzle-kit';

// Drizzle Kit runs outside Nest. Same default as the app's dev config (docker-compose.yml).
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://fundizo:fundizo_dev_only@localhost:5432/fundizo',
  },
  strict: true,
  verbose: true,
});
