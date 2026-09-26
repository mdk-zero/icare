import { defineConfig, devices } from '@playwright/test';
import { baseUrl } from './tests/env.mjs';

/**
 * Frontend (end-to-end) tests. They drive a real browser against a running
 * iCARE++ web app — `npm run dev` locally, or a deployment via TEST_BASE_URL —
 * and never create, edit or delete data. See tests/README.md.
 */
export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  // Several sign-ins at once trip the login rate limit on a small instance.
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['./tests/e2e/icare-reporter.ts'],
  ],
  use: {
    baseURL: baseUrl,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
