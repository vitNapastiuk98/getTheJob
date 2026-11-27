import { defineConfig } from '@playwright/test';

const port = process.env.INTERVIEWFORGE_E2E_PORT ?? '47832';
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  workers: 1,
  forbidOnly: true,
  outputDir: process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'test-results',
  use: {
    baseURL, viewport: { width: 1440, height: 900 },
    ...(process.env.PLAYWRIGHT_CHROME ? { channel: 'chrome' } : {}),
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node --import tsx scripts/qa/server.ts',
    url: `${baseURL}/api/health`,
    env: { INTERVIEWFORGE_E2E_PORT: port },
    reuseExistingServer: false,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5000 },
    stdout: 'pipe',
  },
});
