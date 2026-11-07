import { expect, test, type Page } from '@playwright/test';
import { accounts } from '../env.mjs';
import { evidence, observation } from './qa-helpers';

/**
 * Signing in, recovering a password, and the contact form, as a visitor who is
 * not signed in (TC-AUTH-01, signing in through the form, is in auth.setup.ts):
 *   TC-AUTH-02  an empty sign-in form is not sent
 *   TC-AUTH-03  a wrong password gets the same answer as an unknown email
 *   TC-AUTH-04  a student is sent to the mobile app and not let in
 *   TC-AUTH-05  password recovery answers the same whether or not the account exists
 *   TC-AUTH-06  every portal page sends a signed-out visitor to sign in, and remembers where they were going
 *   TC-AUTH-07  the contact form refuses an incomplete request without sending it
 *
 * The login route allows 10 attempts per email and 20 per address in 15
 * minutes, right or wrong, so these tests try as few as they can.
 */

/** Counts the requests the page sends to an API path. */
function countRequests(page: Page, path: string) {
  const sent: string[] = [];
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === path) sent.push(request.method());
  });
  return sent;
}

async function submitSignIn(page: Page, email: string, password: string) {
  await page.getByLabel(/email address/i).fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
}

test('TC-AUTH-02: an empty sign-in form is not sent', async ({ page }, testInfo) => {
  const sent = countRequests(page, '/api/auth/login');
  await page.goto('/login');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();

  // The browser stops it: both fields are required.
  const email = page.getByLabel(/email address/i);
  expect(await email.evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);
  await email.fill('someone@example.com');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  expect(await page.locator('#password').evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);

  // A malformed address is stopped the same way.
  await email.fill('not-an-email');
  await page.locator('#password').fill('anything');
  await page.getByRole('button', { name: 'Sign In', exact: true }).click();
  expect(await email.evaluate((input: HTMLInputElement) => input.validity.typeMismatch)).toBe(true);

  expect(sent, 'sign-in requests sent').toEqual([]);
  await expect(page).toHaveURL(/\/login$/);
  await evidence(page, testInfo, 'TC-AUTH-02-not-sent');
});

test('TC-AUTH-03: a wrong password gets the same answer as an unknown email', async ({ page }, testInfo) => {
  const known = (['faculty', 'admin', 'super_admin'] as const).map((role) => accounts[role]).find(Boolean);
  test.skip(!known, 'needs one staff test account');

  await page.goto('/login');
  await submitSignIn(page, `nobody-${Date.now()}@example.com`, 'definitely-not-the-password');
  const error = page.getByText('Invalid email or password');
  await expect(error).toBeVisible();
  const unknownText = await error.innerText();

  await submitSignIn(page, known!.email, `${known!.password}-wrong`);
  await expect(error).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
  // Same words either way, so the form can't be used to find out who has an account.
  expect(await error.innerText()).toBe(unknownText);
  await evidence(page, testInfo, 'TC-AUTH-03-wrong-password');
  await observation(
    testInfo,
    'TC-AUTH-03-messages',
    `Unknown email:            "${unknownText}"\nKnown email, wrong password: "${await error.innerText()}"\n`,
  );
});

test('TC-AUTH-04: a student is sent to the mobile app and not let in', async ({ page }, testInfo) => {
  const student = accounts.student;
  test.skip(!student, 'TEST_STUDENT_EMAIL/PASSWORD not set');

  await page.goto('/login');
  await submitSignIn(page, student!.email, student!.password);
  await expect(page.getByText(/Students sign in on the iCARE\+\+ mobile app/)).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(/\/login/);
  await evidence(page, testInfo, 'TC-AUTH-04-student-turned-away');

  // The page signed them out again: no portal opens.
  for (const path of ['/instructor', '/dean']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  }
});

test('TC-AUTH-05: password recovery answers the same whether or not the account exists', async ({ page }, testInfo) => {
  // An address nobody has: no email is sent, and no code is stored.
  const email = `qa-nobody-${Date.now()}@example.com`;
  await page.goto('/forgot-password');
  await page.getByLabel(/email address/i).fill(email);
  await page.getByRole('button', { name: 'Send reset code' }).click();

  // The answer a real account gets too, moving on to the code step.
  await expect(page.getByText('If this account exists, a reset code has been sent.')).toBeVisible();
  await expect(page.getByText('Enter the 6-digit code sent to your email.')).toBeVisible();
  await expect(page.getByPlaceholder('000000')).toBeVisible();
  await evidence(page, testInfo, 'TC-AUTH-05-code-step');
});

test('TC-AUTH-06: every portal page sends a signed-out visitor to sign in', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  const paths = [
    '/admin',
    '/admin/users',
    '/admin/tests',
    '/admin/settings',
    '/dean',
    '/dean/student-management',
    '/dean/instructors',
    '/dean/courses',
    '/dean/analytics',
    '/dean/reports',
    '/instructor',
    '/instructor/teams',
    '/instructor/scenarios',
    '/instructor/assessments',
    '/instructor/library',
    '/instructor/analytics',
    '/instructor/reports',
    '/change-password',
  ];
  const seen: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    // The page they asked for is kept, so they return to it after signing in.
    await expect(page, `${path} should require sign-in`).toHaveURL(
      new RegExp(`/login\\?next=${encodeURIComponent(path)}`),
    );
    const landed = new URL(page.url());
    seen.push(`${path.padEnd(28)} ->  ${landed.pathname}${landed.search}`);
  }
  await observation(testInfo, 'TC-AUTH-06-redirects', `Requested                    ->  Where the browser ended up\n${seen.join('\n')}\n`);
});

test('TC-AUTH-07: the contact form refuses an incomplete request without sending it', async ({ page }, testInfo) => {
  const sent = countRequests(page, '/api/contact');
  await page.goto('/signup');

  // Empty: the browser stops it at the first required field.
  await page.getByRole('button', { name: 'Send request' }).click();
  expect(await page.locator('#name').evaluate((input: HTMLInputElement) => input.validity.valueMissing)).toBe(true);

  // Everything but the sex: the page asks for it.
  await page.locator('#name').fill('QA Tester');
  await page.locator('#email').fill('qa-tester@example.com');
  await page.locator('#subject').fill('Automated test, please ignore');
  await page.locator('#message').fill('This request is never sent.');
  await page.getByRole('button', { name: 'Send request' }).click();
  await expect(page.getByText('Select your sex.')).toBeVisible();
  await evidence(page, testInfo, 'TC-AUTH-07-sex-required');

  // A malformed email is stopped by the browser.
  // The radio itself is hidden; its label is what a person clicks.
  await page.locator('label').filter({ hasText: /^Female$/ }).click();
  await expect(page.getByLabel('Female')).toBeChecked();
  await page.locator('#email').fill('not-an-email');
  await page.getByRole('button', { name: 'Send request' }).click();
  expect(await page.locator('#email').evaluate((input: HTMLInputElement) => input.validity.typeMismatch)).toBe(true);

  expect(sent, 'contact requests sent').toEqual([]);
});
