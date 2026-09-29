import { expect, test } from '@playwright/test';
import { accounts } from '../env.mjs';
import { requireAccount, signIn } from './helpers';

test.describe('Admin portal', () => {
  test.beforeEach(async ({ page }) => {
    requireAccount('super_admin');
    await signIn(page, 'super_admin');
  });

  test('dashboard shows the system overview', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'System Dashboard' })).toBeVisible();
    // The sidebar has an "Accounts" section heading too; only look at the page body.
    const outsideNav = page.locator('xpath=//*[not(ancestor-or-self::nav)]');
    for (const label of ['Accounts', 'Active in 7 days', 'Response time · 24 h', 'Reliability · 24 h', 'Health']) {
      await expect(page.getByText(label, { exact: true }).and(outsideNav)).toBeVisible();
    }
  });

  test('navigation reaches every section', async ({ page }) => {
    const nav = page.getByRole('navigation').first();
    for (const [link, heading] of [
      ['Users', 'Users'],
      ['Performance', 'Performance'],
      ['Test Results', 'Test Results'],
      ['Settings', 'Settings'],
      ['Dashboard', 'System Dashboard'],
    ]) {
      await nav.getByRole('link', { name: link, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }
  });

  test('users list includes this account and filters by search', async ({ page }) => {
    const email = accounts.super_admin!.email;
    await page.goto('/super-admin/users');
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
    await page.goto('/super-admin/users');
    await page.getByRole('button', { name: 'Create a new account' }).click();
    const dialog = page.getByRole('dialog', { name: 'New account' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel('Role')).toContainText('Admin');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });

  test('performance page switches time ranges', async ({ page }) => {
    await page.goto('/super-admin/performance');
    const range = page.getByRole('radiogroup', { name: 'Time range' });
    await range.getByRole('radio', { name: '7 days' }).click();
    await expect(range.getByRole('radio', { name: '7 days' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByRole('heading', { name: 'Endpoints' }).or(page.getByText(/Migration 054/))).toBeVisible();
  });

  test('test results lists every kind of test', async ({ page }) => {
    await page.goto('/super-admin/tests');
    for (const heading of [
      'Health checks',
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
    await page.goto('/super-admin/tests');
    const section = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Health checks' }) });
    await section.getByRole('button', { name: 'Run checks' }).click();
    await expect(section.getByRole('button', { name: 'Run checks' })).toBeEnabled({ timeout: 30_000 });
    const labels = ['AI: Claude (primary)', 'AI: Gemini (fallback)', 'AI: OpenRouter (last fallback)'];
    for (const label of labels) await expect(section.getByText(label).first()).toBeVisible();
    const order = await section.locator('li p.font-medium').allInnerTexts();
    const positions = labels.map((label) => order.findIndex((text) => text.startsWith(label)));
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  test('teaching portals send the admin back', async ({ page }) => {
    for (const path of ['/admin', '/faculty']) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/super-admin(\?|$)/);
    }
  });
});
