import { defineConfig, devices } from '@playwright/test';
import { baseUrl } from './tests/env.mjs';

/**
 * Frontend (end-to-end) tests. They drive a real browser against a running
 * iCARE++ web app — `npm run dev` locally, or a deployment via TEST_BASE_URL —
 * and never create, edit or delete data: anything that writes runs in the
 * demo, which never reaches the database. See tests/README.md.
 *
 * Against localhost, Playwright starts `npm run dev` itself when nothing is
 * listening there yet, and stops it after the run; a dev server already
 * running is used as it is.
 *
 * Each role signs in once, in the "setup" project, and every test of that role
 * reuses the session. A sign-in replaces the account's earlier web session, and
 * the login route allows 20 attempts per address in 15 minutes, so signing in
 * per test would sign the tests out of each other and run into that limit.
 */
const target = new URL(baseUrl);
const isLocal = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname);

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: 2,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ['./tests/e2e/icare-reporter.ts'],
  ],
  webServer: isLocal
    ? {
        command: `npm run dev -- --port ${target.port || '3000'}`,
        url: baseUrl,
        reuseExistingServer: true,
        // The first request compiles the landing page, which can take a while.
        timeout: 180_000,
        // Keeps next dev's MaxListenersExceededWarning flood out of the test output.
        env: { NODE_NO_WARNINGS: '1' },
      }
    : undefined,
  use: {
    baseURL: baseUrl,
    // Recorded on every run, so a pass can be shown and not only a failure.
    trace: 'on',
    video: 'on',
    screenshot: 'on',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /\.setup\.ts$/,
      // The sign-in form is filled in here: keep the passwords out of traces and videos.
      use: { ...devices['Desktop Chrome'], trace: 'off', video: 'off', screenshot: 'off' },
      teardown: 'session',
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
      testIgnore: /(layout|phone-flows|session)\.spec\.ts$/,
    },
    {
      name: 'phone',
      use: { ...devices['Pixel 7'] },
      dependencies: ['setup'],
      testMatch: /(layout|phone-flows)\.spec\.ts$/,
    },
    {
      // Runs after everything else, pass or fail (setup's teardown): its
      // sign-in replaces the Dean session the other projects use. It types a
      // password too, so no trace or video either.
      name: 'session',
      use: { ...devices['Desktop Chrome'], trace: 'off', video: 'off' },
      testMatch: /session\.spec\.ts$/,
    },
  ],
});
