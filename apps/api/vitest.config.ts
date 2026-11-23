import { defineConfig } from 'vitest/config';
import { testEnv } from './test/test-env.js';

// Integration tests use their own database and Redis DB, so they never touch dev data.
const { DATABASE_URL, REDIS_URL } = testEnv();

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.spec.ts', 'test/**/*.e2e-spec.ts'],
    globalSetup: ['./test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL,
      REDIS_URL,
      LOG_LEVEL: 'silent',
      BREVO_API_KEY: '',
      // The test client speaks plain http; a dedicated test checks cookies are Secure by default.
      SESSION_COOKIE_SECURE: 'false',
    },
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
  },
});
