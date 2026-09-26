import { expect, test } from '@playwright/test';
import { accounts } from '../env.mjs';
import { HOME, type Role } from './helpers';

test.describe('Sign-in page', () => {
  test('renders the email and password form', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel(/email address/i)).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeEnabled();
  });

  test('rejects a wrong password with a message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email address/i).fill(`nobody-${Date.now()}@example.com`);
    await page.locator('#password').fill('definitely-not-the-password');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page.getByText('Invalid email or password')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });

  test('offers password recovery', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.getByRole('textbox').first()).toBeVisible();
  });

  // The form end to end, with whichever staff account is configured.
  const staff = (['super_admin', 'admin', 'faculty'] as Role[]).find((role) => accounts[role]);
  test('signs a staff member in through the form', async ({ page }) => {
    test.skip(!staff, 'no staff test account configured');
    const account = accounts[staff!]!;
    await page.goto('/login');
    await page.getByLabel(/email address/i).fill(account.email);
    await page.locator('#password').fill(account.password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${HOME[staff!]}(\\?|$)`), { timeout: 20_000 });
  });
});

test.describe('Signed-out access', () => {
  for (const path of ['/admin', '/faculty', '/super-admin', '/super-admin/users']) {
    test(`${path} sends a signed-out visitor to sign in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}`));
    });
  }
});
