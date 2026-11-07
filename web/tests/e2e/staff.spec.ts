import { expect, test, type Page } from '@playwright/test';
import { signedInAs, signIn } from './helpers';
import { chooseAction } from './qa-helpers';

test.describe('Dean portal', () => {
  signedInAs('admin');
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'admin');
  });

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
    for (const path of ['/dean/student-management', '/dean/instructors', '/dean/program-chairs', '/dean/curriculum', '/dean/courses', '/dean/analytics']) {
      const res = await page.goto(path);
      expect(res?.ok(), path).toBeTruthy();
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    }
  });
});

// The demo needs no account, and never reaches the database.
async function startDemo(page: Page, choice: 'Dean' | 'Program Chair') {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Try a demo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${choice}\\b`) }).click();
  await expect(page).toHaveURL(/\/dean(\?|$)/);
}

test.describe('Curriculum page', () => {
  const openCurriculum = async (page: Page) => {
    await page.getByRole('link', { name: 'Curriculum', exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Curriculum' })).toBeVisible();
  };

  test('a Dean uploads a PDF, corrects it and puts it in use', async ({ page }) => {
    await startDemo(page, 'Dean');
    await openCurriculum(page);

    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.getByRole('button', { name: 'Upload a curriculum PDF' }).click(),
    ]);
    await chooser.setFiles({ name: 'curriculum.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    await expect(page.getByText('Not in use yet.')).toBeVisible({ timeout: 20_000 });

    // The demo's reading has a pre-requisite in the wrong order; fixing it clears the flag.
    const flag = page.getByRole('listitem').filter({ hasText: 'NCM 113 needs NCM 116 first' });
    await expect(flag).toBeVisible();
    await flag.getByRole('button', { name: 'Open course' }).click();
    await page.getByRole('button', { name: 'Remove NCM 116' }).click();
    await page.getByRole('button', { name: 'Save course' }).click();
    await expect(flag).toHaveCount(0);

    await page.getByRole('button', { name: 'Use this curriculum' }).click();
    await page.getByRole('button', { name: 'Use this curriculum' }).last().click();
    await expect(page.getByText('In use', { exact: true })).toBeVisible();
    await expect(page.getByText('Not in use yet.')).toHaveCount(0);
  });

  test('a co-requisite shows on both courses', async ({ page }) => {
    await startDemo(page, 'Dean');
    await openCurriculum(page);

    // By the course's own code: once linked, each row names the other too.
    const courseRow = (code: string) =>
      page.getByRole('row').filter({ has: page.getByRole('button', { name: code, exact: true }) });

    await courseRow('NCM 106').getByText('Pharmacology').click();
    await page.locator('#curriculum-co').selectOption({ label: 'NCM 102 · Health Education' });
    await page.getByRole('button', { name: 'Save course' }).click();
    await expect(page.locator('#curriculum-co')).toHaveCount(0);

    // They're in different terms, so it is flagged too.
    await expect(page.getByText('NCM 102 and NCM 106 are co-requisites', { exact: false })).toBeVisible();
    await expect(courseRow('NCM 102').getByText('NCM 106', { exact: true })).toBeVisible();
    await expect(courseRow('NCM 106').getByText('NCM 102', { exact: true })).toBeVisible();
  });

  test('a Program Chair has it too', async ({ page }) => {
    await startDemo(page, 'Program Chair');
    await openCurriculum(page);
    await expect(page.getByText('NCM 101L', { exact: true }).first()).toBeVisible();
  });

  test('Assign Course offers only lab courses', async ({ page }) => {
    await startDemo(page, 'Dean');
    await page.goto('/dean/courses/new');
    const options = page.locator('#assign-course option');
    await expect(options.filter({ hasText: 'NCM 104L' })).toHaveCount(1);
    const codes = (await options.allTextContents()).filter((t) => t.includes(' · ')).map((t) => t.split(' · ')[0]);
    expect(codes.filter((code) => !/\dL$/.test(code))).toEqual([]);
  });
});

test.describe('Program Chairs page', () => {
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

    await chooseAction(row, 'Edit Account');
    const edit = page.getByRole('dialog', { name: 'Edit Program Chair Account' });
    await expect(edit.getByLabel(/Gender/)).toHaveValue('female');
    await edit.getByLabel('Full Name').fill('Renamed Chair');
    await edit.getByRole('button', { name: 'Save Changes' }).click();
    const renamed = page.getByRole('row', { name: /Renamed Chair/ });
    await expect(renamed).toBeVisible();

    await chooseAction(renamed, 'Delete Account');
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
  signedInAs('faculty');
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'faculty');
  });

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
