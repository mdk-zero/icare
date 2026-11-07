import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

/**
 * Helpers for the test-case specs (the TC-… ones). Each spec lists its test
 * cases at the top, and each test saves screenshots at the moments that
 * matter, for a QA report to quote.
 */

const EVIDENCE_DIR = join(__dirname, '..', '..', 'qa', 'evidence');

/**
 * Takes a screenshot at a key moment of a test. It is attached to the HTML
 * report and saved under qa/evidence/ (gitignored: signed-in pages show real
 * names), so a QA report can show the page while the check passed. The
 * automatic screenshot is taken only once the test has ended.
 */
export async function evidence(page: Page, testInfo: TestInfo, name: string, options: { fullPage?: boolean } = {}) {
  const body = await page.screenshot({ fullPage: options.fullPage ?? false });
  const file = `${name}${testInfo.project.name === 'phone' ? '-phone' : ''}`;
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(EVIDENCE_DIR, `${file}.png`), body);
  await testInfo.attach(file, { body, contentType: 'image/png' });
}

/** Saves a short text record of what a test observed, next to the screenshots. */
export async function observation(testInfo: TestInfo, name: string, text: string) {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(join(EVIDENCE_DIR, `${name}.txt`), text);
  await testInfo.attach(name, { body: text, contentType: 'text/plain' });
}

/**
 * Collects what went wrong while a test browsed: uncaught script errors and
 * API calls the server failed (5xx). Check it with `expect(problems).toEqual([])`.
 */
export function watchProblems(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`script error on ${page.url()}: ${error.message}`));
  page.on('response', (response) => {
    if (response.status() >= 500 && new URL(response.url()).pathname.startsWith('/api/')) {
      problems.push(`HTTP ${response.status()} from ${response.request().method()} ${new URL(response.url()).pathname}`);
    }
  });
  return problems;
}

/** How far the page scrolls sideways, in pixels. 0 means it fits. */
export function sidewaysOverflow(page: Page): Promise<number> {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
}

/** The visible buttons and links that a screen reader would announce with no name. */
export async function unnamedControls(page: Page): Promise<string[]> {
  const snapshot = await page.locator('body').ariaSnapshot();
  return snapshot
    .split('\n')
    .filter((line) => /^\s*- (button|link)\b/.test(line) && !/^\s*- (button|link) "/.test(line))
    .map((line) => `${line.trim()} on ${new URL(page.url()).pathname}`);
}

export type DemoChoice = 'Instructor' | 'Dean' | 'Program Chair';

/**
 * Starts the demo from the sign-in page. It needs no account and keeps every
 * change in the browser: nothing it does reaches the API or the database.
 */
export async function startDemo(page: Page, choice: DemoChoice) {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Try a demo' }).click();
  await page.getByRole('dialog').getByRole('button', { name: new RegExp(`^${choice}\\b`) }).click();
  await expect(page).toHaveURL(choice === 'Instructor' ? /\/instructor(\?|$)/ : /\/dean(\?|$)/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

/** The sidebar's links, as [label, address] pairs. */
export async function sidebarLinks(page: Page): Promise<Array<[string, string]>> {
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('link').first()).toBeAttached();
  return nav
    .getByRole('link')
    .evaluateAll((links) => links.map((a) => [a.textContent!.trim(), a.getAttribute('href')!] as [string, string]));
}

/**
 * Opens every page in the sidebar and checks each one shows its heading.
 * Returns what each page showed, for an observation record.
 */
export async function visitEverySidebarPage(page: Page): Promise<string[]> {
  const seen: string[] = [];
  for (const [label, href] of await sidebarLinks(page)) {
    const response = await page.goto(href);
    expect(response?.status(), `${href} status`).toBeLessThan(400);
    const heading = page.getByRole('heading', { level: 1 }).first();
    await expect(heading, `${label} (${href}) shows its heading`).toBeVisible({ timeout: 20_000 });
    seen.push(`${label.padEnd(24)} ${href.padEnd(34)} "${(await heading.innerText()).trim()}"`);
  }
  return seen;
}

/**
 * Picks an item from a table row's "Actions for …" menu. The menu shuts on
 * any scroll, and a page can still be settling just after it loads, so it is
 * opened again until the item shows.
 */
export async function chooseAction(row: Locator, name: string) {
  const item = row.page().getByRole('menuitem', { name });
  await expect(async () => {
    if (!(await item.isVisible())) await row.getByRole('button', { name: /^Actions for / }).click();
    await expect(item).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await item.click();
}
