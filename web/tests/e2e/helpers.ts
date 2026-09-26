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
 * test in auth.spec.ts.
 */
export async function signIn(page: Page, role: Role) {
  const account = requireAccount(role);
  const res = await page.request.post('/api/auth/login', { data: account });
  expect(res.ok(), `sign-in as ${role} failed (HTTP ${res.status()})`).toBeTruthy();
  const { user } = await res.json();
  expect(user.force_password_change, `the ${role} test account must not need a password change`).toBeFalsy();
  await page.goto(HOME[role]);
  await expect(page).toHaveURL(new RegExp(`${HOME[role]}(\\?|$)`));
}
