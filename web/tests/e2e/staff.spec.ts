import { expect, test, type Page } from '@playwright/test';
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
    for (const path of ['/dean/student-management', '/dean/instructors', '/dean/program-chairs', '/dean/courses', '/dean/analytics']) {
      const res = await page.goto(path);
      expect(res?.ok(), path).toBeTruthy();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});

// The demo needs no account, and never reaches the database.
test.describe('Program Chairs page', () => {
  async function startDemo(page: Page, choice: 'Dean' | 'Program Chair') {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Try a demo' }).click();
    await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${choice}\\b`) }).click();
    await expect(page).toHaveURL(/\/dean(\?|$)/);
  }

  test('a Dean has it', async ({ page }) => {
    await startDemo(page, 'Dean');
    await page.getByRole('link', { name: 'Program Chairs', exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Program Chairs' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add Program Chair' })).toBeVisible();
  });

  test('a Dean adds, edits and deletes one', async ({ page }) => {
    await startDemo(page, 'Dean');
    await page.getByRole('link', { name: 'Program Chairs', exact: true }).first().click();

    await page.getByRole('button', { name: 'Add Program Chair' }).click();
    const add = page.getByRole('dialog', { name: 'Add New Program Chair' });
    await add.getByLabel('Full Name').fill('Test Chair');
    await add.getByLabel('Email').fill('test.chair@demo.icare.ph');
    await add.getByLabel(/Gender/).selectOption('female');
    await add.getByRole('button', { name: 'Add Program Chair' }).click();
    const row = page.getByRole('row', { name: /Test Chair/ });
    await expect(row).toBeVisible();

    await row.getByRole('button', { name: 'Actions for Test Chair' }).click();
    await page.getByRole('menuitem', { name: 'Edit Account' }).click();
    const edit = page.getByRole('dialog', { name: 'Edit Program Chair Account' });
    await expect(edit.getByLabel(/Gender/)).toHaveValue('female');
    await edit.getByLabel('Full Name').fill('Renamed Chair');
    await edit.getByRole('button', { name: 'Save Changes' }).click();
    const renamed = page.getByRole('row', { name: /Renamed Chair/ });
    await expect(renamed).toBeVisible();

    await renamed.getByRole('button', { name: 'Actions for Renamed Chair' }).click();
    await page.getByRole('menuitem', { name: 'Delete Account' }).click();
    await page.getByRole('button', { name: 'Delete Account' }).click();
    await expect(renamed).toHaveCount(0);
  });

  test('a Program Chair does not', async ({ page }) => {
    await startDemo(page, 'Program Chair');
    await expect(page.getByRole('link', { name: 'Instructors', exact: true }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'Program Chairs', exact: true })).toHaveCount(0);
    await page.goto('/dean/program-chairs');
    await expect(page).toHaveURL(/\/dean(\?|$)/);
    await expect(page.getByRole('heading', { level: 1, name: 'Program Chairs' })).toHaveCount(0);
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
