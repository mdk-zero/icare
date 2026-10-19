import { expect, test } from '@playwright/test';

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

  // Signing in through the form lives with the signed-in tests of its role
  // (formSignInTest in helpers.ts), so it can't sign them out mid-run.
});

test.describe('Signed-out access', () => {
  for (const path of ['/admin', '/faculty', '/super-admin', '/super-admin/users']) {
    test(`${path} sends a signed-out visitor to sign in`, async ({ page }) => {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(path)}`));
    });
  }
});
