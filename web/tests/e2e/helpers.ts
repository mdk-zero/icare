import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { accounts } from '../env.mjs';

export type Role = 'super_admin' | 'admin' | 'faculty' | 'student';

export const HOME: Record<Role, string> = {
  super_admin: '/admin',
  admin: '/dean',
  faculty: '/instructor',
  student: '/dashboard',
};

/** Where auth.setup.ts keeps each role's signed-in browser state (gitignored). */
export function authFile(role: Role) {
  return join(__dirname, '..', '.auth', `${role}.json`);
}

/** Skips the calling describe block when that role's test account isn't configured. */
export function requireAccount(role: Role) {
  test.skip(!accounts[role], `TEST_${role.toUpperCase()}_EMAIL/PASSWORD not set`);
  return accounts[role]!;
}

/**
 * Runs the calling describe block (or file) signed in as `role`, on the
 * session auth.setup.ts opened. Every test shares that one session, so they
 * can run side by side, and none of them signs in again. Skipped when the
 * role has no test account.
 */
export function signedInAs(role: Role) {
  requireAccount(role);
  if (accounts[role]) test.use({ storageState: authFile(role) });
}

/** Opens the role's home page on the shared session. */
export async function signIn(page: Page, role: Role) {
  await page.goto(HOME[role]);
  await expect(page, `the ${role} session from auth.setup.ts was not accepted`).toHaveURL(
    new RegExp(`${HOME[role]}(\\?|$)`),
  );
}
