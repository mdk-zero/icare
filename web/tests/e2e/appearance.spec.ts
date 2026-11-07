import { expect, test, type Page } from '@playwright/test';
import { evidence, startDemo } from './qa-helpers';

/**
 * The colour theme setting on the profile page (System / Light / Dark), in
 * the Instructor demo:
 *   TC-UI-01  choosing Dark applies at once and is still there after a reload and on other pages
 *   TC-UI-02  System follows the device, and Light overrides a dark device
 */

const KEY = 'icare_theme';

async function choose(page: Page, label: 'System' | 'Light' | 'Dark') {
  const option = page.getByRole('radiogroup', { name: 'Colour theme' }).getByRole('radio', { name: new RegExp(`^${label}`) });
  await option.click();
  await expect(option).toHaveAttribute('aria-checked', 'true');
}

const html = (page: Page) => page.locator('html');
const stored = (page: Page) => page.evaluate((key) => localStorage.getItem(key), KEY);

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await startDemo(page, 'Instructor');
  await page.goto('/instructor/settings');
  await expect(page.getByRole('radiogroup', { name: 'Colour theme' })).toBeVisible();
});

test('TC-UI-01: choosing Dark applies at once and stays after a reload', async ({ page }, testInfo) => {
  await expect(html(page)).not.toHaveClass(/\bdark\b/);

  await choose(page, 'Dark');
  await expect(html(page)).toHaveClass(/\bdark\b/);
  await expect(html(page)).toHaveAttribute('data-theme', 'dark');
  expect(await stored(page)).toBe('dark');
  await evidence(page, testInfo, 'TC-UI-01-dark');

  await page.reload();
  await expect(html(page)).toHaveClass(/\bdark\b/);
  await page.goto('/instructor/reports');
  await expect(html(page)).toHaveClass(/\bdark\b/);
  await evidence(page, testInfo, 'TC-UI-01-dark-elsewhere');
});

test('TC-UI-02: System follows the device, and Light overrides a dark device', async ({ page }, testInfo) => {
  await choose(page, 'System');
  expect(await stored(page)).toBe('system');
  await expect(html(page)).not.toHaveClass(/\bdark\b/);

  // The device switches to dark: the page follows without a reload.
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(html(page)).toHaveClass(/\bdark\b/);
  await evidence(page, testInfo, 'TC-UI-02-system-dark');

  // Light wins over the device, and stays after a reload.
  await choose(page, 'Light');
  await expect(html(page)).not.toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(html(page)).not.toHaveClass(/\bdark\b/);
  expect(await stored(page)).toBe('light');
  await evidence(page, testInfo, 'TC-UI-02-light');
});
