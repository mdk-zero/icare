import { expect, test, type Page } from '@playwright/test';
import { signedInAs, signIn } from './helpers';
import { evidence, sidebarLinks, sidewaysOverflow, startDemo, unnamedControls, type DemoChoice } from './qa-helpers';

/**
 * Phone-size layout (the "phone" project, Pixel 7): no page may scroll
 * sideways, and every button and link keeps a name a screen reader can read
 * out (the phone header has its own menu button).
 *   TC-LAY-01  the public pages fit a phone
 *   TC-LAY-02  the Instructor portal fits a phone (demo)
 *   TC-LAY-03  the Dean portal fits a phone (demo)
 *   TC-LAY-04  the Admin portal fits a phone (real account)
 */

/** Opens each address and returns what didn't fit or had no name. */
async function checkPages(page: Page, paths: string[]) {
  const problems: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 }).first(), `${path} heading`).toBeVisible({ timeout: 20_000 });
    const overflow = await sidewaysOverflow(page);
    if (overflow > 0) problems.push(`${path} scrolls sideways by ${overflow}px`);
    problems.push(...(await unnamedControls(page)));
  }
  return problems;
}

test('TC-LAY-01: the public pages fit a phone', async ({ page }, testInfo) => {
  const problems = await checkPages(page, ['/', '/login', '/signup', '/forgot-password', '/privacy', '/terms']);
  expect(problems).toEqual([]);
  await page.goto('/login');
  await evidence(page, testInfo, 'TC-LAY-01-sign-in');
});

for (const [id, choice] of [
  ['TC-LAY-02', 'Instructor'],
  ['TC-LAY-03', 'Dean'],
] as const satisfies ReadonlyArray<readonly [string, DemoChoice]>) {
  test(`${id}: the ${choice} portal fits a phone`, async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await startDemo(page, choice);
    const paths = (await sidebarLinks(page)).map(([, href]) => href);
    expect(await checkPages(page, paths)).toEqual([]);
    await page.goto(paths[0]);
    await evidence(page, testInfo, `${id}-${choice.toLowerCase()}-home`);
  });
}

test.describe('Admin, real account', () => {
  signedInAs('super_admin');

  test('TC-LAY-04: the Admin portal fits a phone', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await signIn(page, 'super_admin');
    const paths = (await sidebarLinks(page)).map(([, href]) => href);
    expect(await checkPages(page, paths)).toEqual([]);
    await page.goto('/admin');
    await evidence(page, testInfo, 'TC-LAY-04-admin-home');
  });
});
