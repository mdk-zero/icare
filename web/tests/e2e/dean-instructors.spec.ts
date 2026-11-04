import { expect, test, type Page } from '@playwright/test';

/**
 * The Dean's instructor accounts. These do create, edit and delete, unlike the
 * rest of this folder, because they run in the demo: it needs no account, and
 * nothing it does reaches the database.
 */

function firstRow(page: Page) {
  return page.locator('tbody tr').first();
}

async function chooseAction(page: Page, name: string) {
  await firstRow(page).getByRole('button', { name: /^Actions for / }).click();
  await page.getByRole('menuitem', { name }).click();
}

test.describe('Dean: instructor accounts', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('button', { name: 'Try a demo' }).click();
    await page.getByRole('dialog').getByRole('button', { name: /^Dean\b/ }).click();
    await expect(page).toHaveURL(/\/dean(\?|$)/);
    await page.getByRole('link', { name: 'Instructors', exact: true }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: 'Instructors' })).toBeVisible();
    await expect(firstRow(page).getByRole('button', { name: /^Actions for / })).toBeVisible();
  });

  test('adds one', async ({ page }) => {
    await page.getByRole('button', { name: 'Add an instructor account' }).click();
    await page.getByPlaceholder('Dr. Juan dela Cruz').fill('Test Instructor');
    await page.getByLabel('Gender').selectOption('female');
    await page.getByPlaceholder('faculty@icare.edu').fill('test.instructor@example.com');
    await page.getByRole('button', { name: 'Add Instructor', exact: true }).click();

    const row = page.locator('tbody tr', { hasText: 'test.instructor@example.com' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /^Actions for / }).click();
    await page.getByRole('menuitem', { name: 'Edit Account' }).click();
    await expect(page.getByLabel('Gender')).toHaveValue('female');
  });

  test('adds one without a gender', async ({ page }) => {
    await page.getByRole('button', { name: 'Add an instructor account' }).click();
    await page.getByPlaceholder('Dr. Juan dela Cruz').fill('Test Instructor');
    await expect(page.getByLabel('Gender')).toHaveValue('');
    await page.getByPlaceholder('faculty@icare.edu').fill('no.gender@example.com');
    await page.getByRole('button', { name: 'Add Instructor', exact: true }).click();

    const row = page.locator('tbody tr', { hasText: 'no.gender@example.com' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /^Actions for / }).click();
    await page.getByRole('menuitem', { name: 'Edit Account' }).click();
    await expect(page.getByLabel('Gender')).toHaveValue('');
  });

  test('edits one', async ({ page }) => {
    await chooseAction(page, 'Edit Account');
    await page.getByLabel('Full Name').fill('Renamed Instructor');
    await page.getByLabel('Gender').selectOption('female');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByText('Instructor account updated')).toBeVisible();

    const row = page.locator('tbody tr', { hasText: 'Renamed Instructor' });
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: /^Actions for / }).click();
    await page.getByRole('menuitem', { name: 'Edit Account' }).click();
    await expect(page.getByLabel('Full Name')).toHaveValue('Renamed Instructor');
    await expect(page.getByLabel('Gender')).toHaveValue('female');
  });

  test('will not save an empty name', async ({ page }) => {
    await chooseAction(page, 'Edit Account');
    await page.getByLabel('Full Name').fill('   ');
    await page.getByRole('button', { name: 'Save Changes' }).click();

    await expect(page.getByText('Name is required')).toBeVisible();
    await expect(page.getByLabel('Full Name')).toBeVisible();
  });

  test('deletes one, after saying what that changes', async ({ page }) => {
    const email = (await firstRow(page).locator('td').first().locator('p').nth(1).textContent())!;
    await chooseAction(page, 'Delete Account');

    const dialog = page.getByRole('heading', { name: /^Delete .* account\?$/ }).locator('xpath=ancestor::div[contains(@class, "max-w-md")]');
    await expect(dialog).toContainText(email);
    await expect(dialog).toContainText('The grades they gave');

    // Cancelling leaves them alone.
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('cell', { name: new RegExp(email) })).toBeVisible();

    await chooseAction(page, 'Delete Account');
    await dialog.getByRole('button', { name: 'Delete Account' }).click();
    await expect(page.getByText(/account was deleted/)).toBeVisible();
    await expect(page.getByRole('cell', { name: new RegExp(email) })).toHaveCount(0);
  });

  test('a row still opens group assignment, but its menu does not', async ({ page }) => {
    await firstRow(page).getByRole('button', { name: /^Actions for / }).click();
    await expect(page.getByRole('menuitem', { name: 'Edit Account' })).toBeVisible();
    await expect(page.getByRole('heading', { name: /^Assign Groups to / })).toHaveCount(0);
    await page.keyboard.press('Escape');

    await firstRow(page).locator('td').first().click();
    await expect(page.getByRole('heading', { name: /^Assign Groups to / })).toBeVisible();
  });
});
