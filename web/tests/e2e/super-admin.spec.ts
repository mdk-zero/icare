import { expect, test } from '@playwright/test';
import { accounts } from '../env.mjs';
import { formSignInTest, requireAccount, signIn } from './helpers';

test.describe('Admin portal', () => {
  // In order: each test's sign-in replaces the one before it.
  test.describe.configure({ mode: 'default' });
  test.beforeEach(async ({ page }) => {
    requireAccount('super_admin');
    await signIn(page, 'super_admin');
  });

  formSignInTest('super_admin');

  test('dashboard shows the system overview', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'System Dashboard' })).toBeVisible();
    // The sidebar has an "Accounts" section heading too; only look at the page body.
    const outsideNav = page.locator('xpath=//*[not(ancestor-or-self::nav)]');
    for (const label of [
      'System health status',
      'Reliability · last 24 hours',
      'Response time · last 24 hours',
      'Latest test results',
      'Total accounts',
      'Active users · last 7 days',
    ]) {
      await expect(page.getByText(label, { exact: true }).and(outsideNav)).toBeVisible();
    }
  });

  test('navigation reaches every section', async ({ page }) => {
    const nav = page.getByRole('navigation').first();
    for (const [link, heading] of [
      ['Users', 'Users'],
      ['System Performance', 'System Performance'],
      ['System Tests', 'System Tests'],
      ['Settings', 'Settings'],
      ['Dashboard', 'System Dashboard'],
    ]) {
      await nav.getByRole('link', { name: link, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
  });

  test('users list includes this account and filters by search', async ({ page }) => {
    const email = accounts.super_admin!.email;
    await page.goto('/admin/users');
    const me = page.getByRole('row').filter({ hasText: email });
    await expect(me).toBeVisible();
    await expect(me.getByText('(you)')).toBeVisible();
    // Deleting yourself is refused, so the button is disabled.
    await expect(me.getByRole('button', { name: 'Delete' })).toBeDisabled();

    await page.getByPlaceholder('Search by name or email').fill(email);
    await expect(page.getByRole('row')).toHaveCount(2); // header + this account
    await page.getByPlaceholder('Search by name or email').fill('zz-no-such-account-zz');
    await expect(page.getByText('No accounts match')).toBeVisible();
  });

  test('new-account form opens and cancels without saving', async ({ page }) => {
    await page.goto('/admin/users');
    await page.getByRole('button', { name: 'Create a new account' }).click();
    const dialog = page.getByRole('dialog', { name: 'New account' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Role')).toContainText('Admin');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('performance page switches time ranges', async ({ page }) => {
    await page.goto('/admin/performance');
    const range = page.getByRole('radiogroup', { name: 'Time range' });
    await range.getByRole('radio', { name: '7 days' }).click();
    await expect(range.getByRole('radio', { name: '7 days' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('heading', { name: 'Endpoints' }).or(page.getByText(/Migration 054/))).toBeVisible();
  });

  test('system tests lists every kind of test', async ({ page }) => {
    await page.goto('/admin/tests');
    for (const heading of [
      'System health checks',
      'Frontend tests (Playwright)',
      'API tests (Postman)',
      'Load benchmark',
      'Data warehouse query benchmark',
      'Risk-prediction model evaluation',
    ]) {
      await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    }
  });

  // Saves one health-check run. The AI checks only look models up, so no quota is spent.
  test('health checks cover each AI provider in fallback order', async ({ page }) => {
    await page.goto('/admin/tests');
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'System health checks' }) });
    await section.getByRole('button', { name: 'Check System Health Status' }).click();
    await expect(section.getByRole('button', { name: 'Check System Health Status' })).toBeEnabled({ timeout: 30_000 });
    const labels = ['AI: Claude (primary)', 'AI: Gemini (fallback)', 'AI: OpenRouter (last fallback)'];
    for (const label of labels) await expect(section.getByText(label).first()).toBeVisible();
    const order = await section.locator('li p.font-medium').allInnerTexts();
    const positions = labels.map((label) => order.findIndex((text) => text.startsWith(label)));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test('old /super-admin addresses still open', async ({ page }) => {
    await page.goto('/super-admin/users');
    await expect(page).toHaveURL(/\/admin\/users(\?|$)/);
  });

  test('teaching portals send the admin back', async ({ page }) => {
    for (const path of ['/dean', '/instructor']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/admin(\?|$)/);
    }
  });
});
