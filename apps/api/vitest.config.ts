import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';
import { testEnv } from './test/test-env.js';

// Integration tests use their own database and Redis DB, so they never touch dev data.
const { DATABASE_URL, MIGRATION_DATABASE_URL, REDIS_URL } = testEnv();

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL,
      MIGRATION_DATABASE_URL,
      // Background jobs are off unless a test turns them on (test/jobs.e2e-spec.ts).
      JOBS_ENABLED: 'false',
      REDIS_URL,
      LOG_LEVEL: 'silent',
      BREVO_API_KEY: '',
      // The test client speaks plain http; a dedicated test checks cookies are Secure by default.
      SESSION_COOKIE_SECURE: 'false',
      // Photos written by tests go to a throwaway folder, never the dev .storage folder.
      STORAGE_LOCAL_DIR: join(tmpdir(), 'fundizo-test-storage'),
      WEB_BASE_URL: 'http://localhost:3000',
    },
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
  },
});
