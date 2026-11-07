import { expect, test } from '@playwright/test';
import { signedInAs, signIn } from './helpers';
import { evidence, observation, visitEverySidebarPage, watchProblems } from './qa-helpers';

/**
 * The Admin portal, on the real test account (there is no Admin demo). It
 * reads and changes nothing; super-admin.spec.ts has the page-by-page checks:
 *   TC-ADM-01  every page in the sidebar opens, with no errors
 *   TC-ADM-02  the Admin is kept out of the Dean and Instructor pages, including deep links
 */

test.describe('Admin, real account', () => {
  signedInAs('super_admin');
  test.beforeEach(async ({ page }) => {
    await signIn(page, 'super_admin');
  });

  test('TC-ADM-01: every page in the Admin sidebar opens, with no errors', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const problems = watchProblems(page);
    const seen = await visitEverySidebarPage(page);
    expect(problems, 'errors while browsing').toEqual([]);
    await page.goto('/admin');
    await evidence(page, testInfo, 'TC-ADM-01-dashboard');
    await observation(testInfo, 'TC-ADM-01-pages', `Sidebar link             Address                            Heading shown\n${seen.join('\n')}\n`);
  });

  test('TC-ADM-02: the Admin is kept out of the teaching portals, including deep links', async ({ page }, testInfo) => {
    const seen: string[] = [];
    for (const path of ['/dean/student-management', '/dean/reports', '/instructor/scenarios', '/instructor/reports']) {
      await page.goto(path);
      await expect(page, `${path} should send the Admin home`).toHaveURL(/\/admin(\?|$)/);
      seen.push(`${path.padEnd(26)} ->  ${new URL(page.url()).pathname}`);
    }
    await observation(testInfo, 'TC-ADM-02-redirects', `${seen.join('\n')}\n`);
  });
});
