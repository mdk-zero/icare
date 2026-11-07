import { expect, test as setup } from '@playwright/test';
import { accounts } from '../env.mjs';
import { authFile, HOME, type Role } from './helpers';

/**
 * Signs each staff role in once and saves the browser state for the other
 * projects (see signedInAs in helpers.ts). The first staff account configured
 * signs in through the form, so the form itself is tested on every run; the
 * others go through the API, which is faster and sets the same cookie.
 *
 * "Remember me" is on for all of them: a session without it ends once its
 * last tab closes, and every test opens a fresh browser context.
 */

const STAFF: Role[] = ['super_admin', 'admin', 'faculty'];
const FORM_ROLE = STAFF.find((role) => accounts[role]);
const LABEL: Record<Role, string> = { super_admin: 'Admin', admin: 'Dean', faculty: 'Instructor', student: 'Student' };

for (const role of STAFF) {
  const account = accounts[role];

  if (role === FORM_ROLE) {
    setup(`TC-AUTH-01: an ${LABEL[role]} signs in through the form`, async ({ page }) => {
      await page.goto('/login');
      await page.getByLabel(/email address/i).fill(account!.email);
      await page.locator('#password').fill(account!.password);
      await page.getByLabel('Remember me').check();
      await page.getByRole('button', { name: 'Sign In', exact: true }).click();
      await expect(page).toHaveURL(new RegExp(`${HOME[role]}(\\?|$)`), { timeout: 20_000 });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await page.context().storageState({ path: authFile(role) });
    });
    continue;
  }

  setup(`sign in as ${LABEL[role]}`, async ({ page }) => {
    setup.skip(!account, `TEST_${role.toUpperCase()}_EMAIL/PASSWORD not set`);
    const res = await page.request.post('/api/auth/login', {
      data: { ...account, client: 'web', remember: true },
    });
    expect(res.ok(), `sign-in as ${role} failed (HTTP ${res.status()})`).toBeTruthy();
    const { user } = await res.json();
    expect(user.force_password_change, `the ${role} test account must not need a password change`).toBeFalsy();
    await page.goto(HOME[role]);
    await expect(page).toHaveURL(new RegExp(`${HOME[role]}(\\?|$)`));
    await page.context().storageState({ path: authFile(role) });
  });
}
