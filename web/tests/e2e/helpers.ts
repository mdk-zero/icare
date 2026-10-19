import { expect, test, type Page } from '@playwright/test';
import { accounts } from '../env.mjs';

export type Role = 'super_admin' | 'admin' | 'faculty' | 'student';

export const HOME: Record<Role, string> = {
  super_admin: '/super-admin',
  admin: '/admin',
  faculty: '/faculty',
  student: '/dashboard',
};

/** Skips the calling describe block when that role's test account isn't configured. */
export function requireAccount(role: Role) {
  test.skip(!accounts[role], `TEST_${role.toUpperCase()}_EMAIL/PASSWORD not set`);
  return accounts[role]!;
}

/**
 * Signs in through the API (fast, and sets the same session cookie the form
 * does) and opens the role's home page. The login form itself has its own
 * test, formSignInTest.
 *
 * Each sign-in replaces the account's earlier web session (newest wins), so
 * the tests of one role must not run side by side: every describe that calls
 * this runs its tests in order (`mode: 'default'`). As a web sign-in, it
 * leaves the reporter's session, an app one, alone.
 */
export async function signIn(page: Page, role: Role) {
  const account = requireAccount(role);
  const res = await page.request.post('/api/auth/login', {
    data: { ...account, client: 'web', remember: true },
  });
  expect(res.ok(), `sign-in as ${role} failed (HTTP ${res.status()})`).toBeTruthy();
  const { user } = await res.json();
  expect(user.force_password_change, `the ${role} test account must not need a password change`).toBeFalsy();
  await page.goto(HOME[role]);
  await expect(page).toHaveURL(new RegExp(`${HOME[role]}(\\?|$)`));
}

/** The form test runs as the first staff account configured. */
const FORM_ROLE = (['super_admin', 'admin', 'faculty'] as Role[]).find((role) => accounts[role]);

/**
 * The sign-in form end to end, without "Remember me". Declared inside that
 * role's describe, so it runs in order with the role's other tests: run
 * beside them, its sign-in would sign them out.
 */
export function formSignInTest(role: Role) {
  if (role !== FORM_ROLE) return;
  test('signs in through the form', async ({ page }) => {
    const account = accounts[role]!;
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByLabel(/email address/i).fill(account.email);
    await page.locator('#password').fill(account.password);
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${HOME[role]}(\\?|$)`), { timeout: 20_000 });
  });
}
