import { defineConfig, devices } from '@playwright/test';
import { baseUrl } from './tests/env.mjs';

/**
 * Frontend (end-to-end) tests. They drive a real browser against a running
 * iCARE++ web app — `npm run dev` locally, or a deployment via TEST_BASE_URL —
 * and never create, edit or delete data: anything that writes runs in the
 * demo, which never reaches the database. See tests/README.md.
 *
 * Each role signs in once, in the "setup" project, and every test of that role
 * reuses the session. A sign-in replaces the account's earlier web session, and
 * the login route allows 20 attempts per address in 15 minutes, so signing in
 * per test would sign the tests out of each other and run into that limit.
 */
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
