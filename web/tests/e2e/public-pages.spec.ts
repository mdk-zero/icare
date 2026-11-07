import { expect, test } from '@playwright/test';
import { evidence, observation, watchProblems } from './qa-helpers';

/**
 * What a visitor who is not signed in can reach:
 *   TC-PUB-01  the public pages load and show their heading, with no script errors
 *   TC-PUB-02  the landing page's links lead to the right places
 *   TC-PUB-03  an unknown address shows the "not found" page
 *   TC-PUB-04  the app download link hands Android phones the app and tells iPhones there is none
 *   TC-PUB-05  the sign-in page links to recovery, the contact form and the legal pages
 */

test('TC-PUB-01: the public pages load and show their heading', async ({ page }, testInfo) => {
  const pages: Array<{ path: string; heading: RegExp }> = [
    { path: '/', heading: /Bridging the gap between nursing practice/ },
    { path: '/login', heading: /^Welcome back/ },
    { path: '/signup', heading: /^Contact us$/ },
    { path: '/forgot-password', heading: /^Reset your password$/ },
    { path: '/privacy', heading: /^Privacy Policy$/ },
    { path: '/terms', heading: /^Terms of Use$/ },
  ];
  const problems = watchProblems(page);

  for (const { path, heading } of pages) {
    const response = await page.goto(path);
    expect(response?.status(), `${path} status`).toBeLessThan(400);
    await expect(page.getByRole('heading', { level: 1 }).first(), `${path} heading`).toHaveText(heading);
  }
  expect(problems, 'errors while browsing').toEqual([]);
  await page.goto('/');
  await evidence(page, testInfo, 'TC-PUB-01-landing');
});

test('TC-PUB-02: the landing page links lead to the right places', async ({ page }, testInfo) => {
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Main' });

  // In-page sections: each link scrolls to a section that exists.
  for (const label of ['How It Works', 'Features', 'FAQ']) {
    const href = await nav.getByRole('link', { name: label }).first().getAttribute('href');
    expect(href, `${label} link`).toMatch(/^#/);
    await expect(page.locator(href!), `${label} section`).toBeAttached();
  }

  await nav.getByRole('link', { name: 'Sign In' }).first().click();
  await expect(page).toHaveURL(/\/login$/);

  await page.goto('/');
  await nav.getByRole('link', { name: 'Contact Us' }).first().click();
  await expect(page).toHaveURL(/\/signup$/);

  // Nobody self-registers: the instructor and dean cards lead to the contact form.
  await page.goto('/');
  for (const action of ['Create an instructor account', 'Set up your program']) {
    await expect(page.getByRole('link', { name: action })).toHaveAttribute('href', '/signup');
  }
  await page.getByRole('link', { name: 'Create an instructor account' }).click();
  await expect(page).toHaveURL(/\/signup$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contact us');
  await evidence(page, testInfo, 'TC-PUB-02-contact-form');
});

test('TC-PUB-03: an unknown address shows the not-found page', async ({ page }, testInfo) => {
  const response = await page.goto('/no-such-page-qa');
  expect(response?.status()).toBe(404);
  await expect(page.getByText('This page could not be found.')).toBeVisible();
  await evidence(page, testInfo, 'TC-PUB-03-not-found');
});

test('TC-PUB-04: the app download link serves Android phones and turns iPhones away', async ({ request }, testInfo) => {
  const android = await request.get('/download', {
    maxRedirects: 0,
    headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Mobile Safari/537.36' },
  });
  // A deployment without MOBILE_APP_URL says so instead of redirecting.
  test.skip(android.status() === 404, 'MOBILE_APP_URL is not set on this deployment');
  expect(android.status()).toBe(302);
  const target = android.headers()['location'];
  expect(target).toMatch(/^https:\/\//);
  expect(android.headers()['cache-control']).toBe('no-store');

  const iphone = await request.get('/download', {
    maxRedirects: 0,
    headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148' },
  });
  expect(iphone.status()).toBe(200);
  expect(await iphone.text()).toContain('iCARE++ is for Android phones');

  await observation(
    testInfo,
    'TC-PUB-04-download-link',
    `GET /download as an Android phone -> HTTP ${android.status()}, Location: ${target}\n` +
      `GET /download as an iPhone       -> HTTP ${iphone.status()}, "iCARE++ is for Android phones"\n`,
  );
});

test('TC-PUB-05: the sign-in page links to recovery, the contact form and the legal pages', async ({ page }) => {
  for (const [label, path, heading] of [
    ['Forgot password?', '/forgot-password', 'Reset your password'],
    ['Contact us', '/signup', 'Contact us'],
    ['Terms of Use', '/terms', 'Terms of Use'],
    ['Privacy Policy', '/privacy', 'Privacy Policy'],
  ] as const) {
    await page.goto('/login');
    await page.getByRole('link', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(heading);
  }
});
