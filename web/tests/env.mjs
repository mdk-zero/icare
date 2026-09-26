/**
 * Shared configuration for the Playwright and Postman suites.
 *
 * Values come from the environment, or from web/.env.test (gitignored; copy
 * .env.test.example). Each role's tests run only when that role's email and
 * password are set, so a partial setup still runs what it can.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// npm scripts run from web/. (No import.meta: Playwright loads this as CommonJS.)
const envFile = join(process.cwd(), '.env.test');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

export const baseUrl = (process.env.TEST_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

/** @typedef {'super_admin' | 'admin' | 'faculty' | 'student'} Role */

/** @type {Record<Role, { email: string, password: string } | null>} */
export const accounts = Object.fromEntries(
  ['super_admin', 'admin', 'faculty', 'student'].map((role) => {
    const key = role.toUpperCase();
    const email = process.env[`TEST_${key}_EMAIL`];
    const password = process.env[`TEST_${key}_PASSWORD`];
    return [role, email && password ? { email, password } : null];
  }),
);

/** Whether to send the finished run to the super admin's Test Results page. */
export const reportEnabled = ['1', 'true', 'yes'].includes((process.env.TEST_REPORT || '').toLowerCase());
