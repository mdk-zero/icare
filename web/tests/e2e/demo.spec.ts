import { expect, test } from '@playwright/test';
import { evidence, observation, sidebarLinks, startDemo } from './qa-helpers';

/**
 * The demo on the sign-in page, which lets a visitor walk a portal on made-up
 * data with no account:
 *   TC-DEMO-01  the demo offers the Instructor, Dean and Program Chair portals, each marked as a demo
 *   TC-DEMO-02  nothing done in the demo reaches the API
 *   TC-DEMO-03  logging out of the demo ends it and throws away its changes
 */

test('TC-DEMO-01: the demo offers three portals, each marked as a demo', async ({ page }, testInfo) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Try a demo' }).click();
  const picker = page.getByRole('dialog');
  for (const choice of ['Instructor', 'Dean', 'Program Chair']) {
    await expect(picker.getByRole('button', { name: new RegExp(`^${choice}\\b`) })).toBeVisible();
  }
  // No Admin demo: the Admin portal holds every account.
  await expect(picker.getByRole('button', { name: /^Admin\b/ })).toHaveCount(0);
  await evidence(page, testInfo, 'TC-DEMO-01-picker');

  const seen: string[] = [];
  for (const [choice, home, title] of [
    ['Instructor', '/instructor', 'Instructor'],
    ['Dean', '/dean', 'Dean'],
    ['Program Chair', '/dean', 'Program Chair'],
  ] as const) {
    await page.context().clearCookies();
    await startDemo(page, choice);
    await expect(page).toHaveURL(new RegExp(`${home}(\\?|$)`));
    // The account card in the sidebar says whose portal it is, and that it is a demo.
    const profile = page.getByRole('complementary').getByRole('link', { name: /Demo$/ });
    await expect(profile).toBeVisible();
    await expect(profile).toContainText(title);
    seen.push(`${choice.padEnd(14)} -> ${new URL(page.url()).pathname}  "${(await profile.innerText()).replace(/\s+/g, ' ')}"`);
  }
  await observation(testInfo, 'TC-DEMO-01-portals', `${seen.join('\n')}\n`);
});

test('TC-DEMO-02: nothing done in the demo reaches the API', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const apiCalls: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith('/api/')) apiCalls.push(`${request.method()} ${url.pathname}`);
  });

  await startDemo(page, 'Dean');
  // Open every page, then make a change.
  for (const [, href] of await sidebarLinks(page)) {
    await page.goto(href);
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible({ timeout: 20_000 });
  }
  await page.goto('/dean/student-management');
  await page.getByRole('button', { name: 'New section' }).click();
  await page.getByLabel(/Section name/).fill('QA demo section');
  await page.getByRole('button', { name: 'Create section' }).click();
  await expect(page.getByRole('button', { name: 'View QA demo section roster' })).toBeVisible();

  expect(apiCalls, 'requests that left the browser for /api').toEqual([]);
  await observation(testInfo, 'TC-DEMO-02-api-calls', `Requests to /api/* while browsing the Dean demo and creating a section: ${apiCalls.length}\n`);
});

test('TC-DEMO-03: logging out of the demo ends it and throws away its changes', async ({ page }, testInfo) => {
  await startDemo(page, 'Dean');
  await page.goto('/dean/student-management');
  await page.getByRole('button', { name: 'New section' }).click();
  await page.getByLabel(/Section name/).fill('QA leftover');
  await page.getByRole('button', { name: 'Create section' }).click();
  await expect(page.getByRole('button', { name: 'View QA leftover roster' })).toBeVisible();

  await page.getByRole('button', { name: 'Log out' }).click();
  const confirm = page.getByRole('dialog', { name: 'Log out' });
  await expect(confirm).toBeVisible();
  await evidence(page, testInfo, 'TC-DEMO-03-log-out');
  await confirm.getByRole('button', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);

  // The portal is closed again...
  await page.goto('/dean');
  await expect(page).toHaveURL(/\/login\?next=%2Fdean/);

  // ...and a new demo starts from the original data.
  await startDemo(page, 'Dean');
  await page.goto('/dean/student-management');
  await expect(page.getByRole('button', { name: /^View .+ roster$/ }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'View QA leftover roster' })).toHaveCount(0);
});
