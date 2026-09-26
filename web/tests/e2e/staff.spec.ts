import { expect, test } from '@playwright/test';
import { requireAccount, signIn } from './helpers';

test.describe('Admin portal', () => {
  test.beforeEach(async ({ page }) => {
    requireAccount('admin');
    await signIn(page, 'admin');
  });

  test('has no Users page any more', async ({ page }) => {
    await expect(page.getByRole('navigation').first().getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
    const res = await page.goto('/admin/users');
    expect(res?.status()).toBe(404);
  });

  test('the super admin portal is off limits', async ({ page }) => {
    await page.goto('/super-admin');
    await expect(page).toHaveURL(/\/admin(\?|$)/);
  });

  test('management pages load', async ({ page }) => {
    for (const path of ['/admin/student-management', '/admin/faculty', '/admin/analytics']) {
      const res = await page.goto(path);
      expect(res?.ok(), path).toBeTruthy();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});

test.describe('Faculty portal', () => {
  test.beforeEach(async ({ page }) => {
    requireAccount('faculty');
    await signIn(page, 'faculty');
  });

  test('dashboard loads', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('admin and super admin portals are off limits', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/faculty(\?|$)/);
    await page.goto('/super-admin');
    await expect(page).toHaveURL(/\/faculty(\?|$)/);
  });
});
