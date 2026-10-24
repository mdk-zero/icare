import { expect, test } from '@playwright/test';
import { formSignInTest, requireAccount, signIn } from './helpers';

test.describe('Dean portal', () => {
  // In order: each test's sign-in replaces the one before it.
  test.describe.configure({ mode: 'default' });
  test.beforeEach(async ({ page }) => {
    requireAccount('admin');
    await signIn(page, 'admin');
  });

  formSignInTest('admin');

  test('has no Users page any more', async ({ page }) => {
    await expect(page.getByRole('navigation').first().getByRole('link', { name: 'Users', exact: true })).toHaveCount(0);
    const res = await page.goto('/dean/users');
    expect(res?.status()).toBe(404);
  });

  test('the admin portal is off limits', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/dean(\?|$)/);
  });

  test('old /admin addresses open the same page under /dean', async ({ page }) => {
    await page.goto('/admin/faculty');
    await expect(page).toHaveURL(/\/dean\/instructors(\?|$)/);
    await page.goto('/admin/courses');
    await expect(page).toHaveURL(/\/dean\/courses(\?|$)/);
  });

  test('management pages load', async ({ page }) => {
    for (const path of ['/dean/student-management', '/dean/instructors', '/dean/courses', '/dean/analytics']) {
      const res = await page.goto(path);
      expect(res?.ok(), path).toBeTruthy();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});

test.describe('Instructor portal', () => {
  // In order: each test's sign-in replaces the one before it.
  test.describe.configure({ mode: 'default' });
  test.beforeEach(async ({ page }) => {
    requireAccount('faculty');
    await signIn(page, 'faculty');
  });

  formSignInTest('faculty');

  test('dashboard loads', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('courses page loads', async ({ page }) => {
    const res = await page.goto('/instructor/courses');
    expect(res?.ok()).toBeTruthy();
    await expect(page.getByRole('heading', { level: 1, name: 'Courses' })).toBeVisible();
  });

  test('old /faculty addresses still open', async ({ page }) => {
    await page.goto('/faculty/courses');
    await expect(page).toHaveURL(/\/instructor\/courses(\?|$)/);
  });

  test('dean and admin portals are off limits', async ({ page }) => {
    await page.goto('/dean');
    await expect(page).toHaveURL(/\/instructor(\?|$)/);
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/instructor(\?|$)/);
  });
});
