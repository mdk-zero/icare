import { expect, test } from '@playwright/test';
import { observation, sidebarLinks, startDemo, unnamedControls, type DemoChoice } from './qa-helpers';

/**
 * Basic accessibility: what a screen reader announces.
 *   TC-A11Y-01  every button and link on the public pages has a name
 *   TC-A11Y-02  every button and link in the Instructor portal has a name (demo)
 *   TC-A11Y-03  every button and link in the Dean portal has a name (demo)
 *   TC-A11Y-04  the sign-in form's fields are labelled, and its password can be shown
 * (layout.spec.ts runs the same name check at phone size.)
 */

test('TC-A11Y-01: every button and link on the public pages has a name', async ({ page }, testInfo) => {
  const unnamed: string[] = [];
  for (const path of ['/', '/login', '/signup', '/forgot-password', '/privacy', '/terms']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    unnamed.push(...(await unnamedControls(page)));
  }
  expect(unnamed, 'buttons and links with no accessible name').toEqual([]);
  await observation(testInfo, 'TC-A11Y-01-public', 'No unnamed buttons or links on /, /login, /signup, /forgot-password, /privacy, /terms\n');
});

for (const [id, choice] of [
  ['TC-A11Y-02', 'Instructor'],
  ['TC-A11Y-03', 'Dean'],
] as const satisfies ReadonlyArray<readonly [string, DemoChoice]>) {
  test(`${id}: every button and link in the ${choice} portal has a name`, async ({ page }) => {
    test.setTimeout(120_000);
    await startDemo(page, choice);
    const unnamed: string[] = [];
    for (const [, href] of await sidebarLinks(page)) {
      await page.goto(href);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
      unnamed.push(...(await unnamedControls(page)));
    }
    expect(unnamed, 'buttons and links with no accessible name').toEqual([]);
  });
}

test('TC-A11Y-04: the sign-in fields are labelled, and the password can be shown', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('textbox', { name: /Email Address/ })).toBeVisible();
  const password = page.getByLabel(/^Password/);
  await expect(password).toHaveAttribute('type', 'password');
  await expect(page.getByRole('checkbox', { name: 'Remember me' })).toBeVisible();

  await password.fill('shown-for-a-moment');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(password).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Hide password' }).click();
  await expect(password).toHaveAttribute('type', 'password');
});
