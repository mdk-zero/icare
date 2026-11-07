import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { accounts } from '../env.mjs';
import { authFile } from './helpers';
import { evidence } from './qa-helpers';

/**
 * Sessions. Runs in the "session" project, after every other test (it is the
 * setup project's teardown), because its sign-in replaces the Dean session
 * the others share. No trace or video: it types the password.
 *   TC-SES-01  a newer sign-in signs out the older browser, and logging out ends the session
 */

test('TC-SES-01: a newer sign-in signs out the older browser, and logging out ends the session', async ({ browser, page }, testInfo) => {
  const dean = accounts.admin;
  test.skip(!dean, 'TEST_ADMIN_EMAIL/PASSWORD not set');

  // Sign in through the form, without "Remember me", from a link that tries
  // to send the browser off the site afterwards.
  await page.goto('/login?next=//example.com/steal');
  await page.getByLabel(/email address/i).fill(dean!.email);
  await page.locator('#password').fill(dean!.password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  // It stays on iCARE++: only same-site addresses are followed.
  await expect(page).toHaveURL(/\/dean(\?|$)/, { timeout: 20_000 });

  // The browser that signed in earlier (auth.setup.ts) is now signed out, and told why.
  if (existsSync(authFile('admin'))) {
    const older = await browser.newContext({ storageState: authFile('admin') });
    const olderPage = await older.newPage();
    await olderPage.goto('/dean');
    await expect(olderPage).toHaveURL(/\/login\?.*reason=replaced/);
    await expect(olderPage.getByText(/signed out because someone signed in to your account on another browser/)).toBeVisible();
    await evidence(olderPage, testInfo, 'TC-SES-01-replaced');
    await older.close();
  }

  // Log out from the sidebar: the portal closes again.
  await page.getByRole('button', { name: 'Log out' }).click();
  const confirm = page.getByRole('dialog', { name: 'Log out' });
  await expect(confirm.getByRole('button', { name: 'Stay signed in' })).toBeVisible();
  await confirm.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/dean');
  await expect(page).toHaveURL(/\/login\?next=%2Fdean/);
  await evidence(page, testInfo, 'TC-SES-01-logged-out');
});
