import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { signedInAs, signIn } from './helpers';
import { evidence, observation, startDemo, visitEverySidebarPage, watchProblems } from './qa-helpers';

/**
 * The Dean portal. TC-DEAN-01 reads the real test account's pages and changes
 * nothing; the rest run in the demo, where changes stay in the browser:
 *   TC-DEAN-01  every page in the sidebar opens, with no errors (real account)
 *   TC-DEAN-02  a section is created, renamed and deleted; a duplicate name is refused
 *   TC-DEAN-03  the activity log downloads as a CSV file
 *   TC-DEAN-04  the instructor report list filters to instructors with no sections
 *   TC-DEAN-05  only the Dean can edit the ward layout
 */

test.describe('Dean, real account', () => {
  signedInAs('admin');

  test('TC-DEAN-01: every page in the Dean sidebar opens, with no errors', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const problems = watchProblems(page);
    await signIn(page, 'admin');
    const seen = await visitEverySidebarPage(page);
    expect(problems, 'errors while browsing').toEqual([]);
    await page.goto('/dean');
    await evidence(page, testInfo, 'TC-DEAN-01-overview');
    await observation(testInfo, 'TC-DEAN-01-pages', `Sidebar link             Address                            Heading shown\n${seen.join('\n')}\n`);
  });
});

test.describe('Dean, demo', () => {
  test.beforeEach(async ({ page }) => {
    await startDemo(page, 'Dean');
  });

  test('TC-DEAN-02: a section is created, renamed and deleted', async ({ page }, testInfo) => {
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Students' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Students' })).toBeVisible();
    const existing = (await page.getByRole('button', { name: /^View .+ roster$/ }).first().getAttribute('aria-label'))!
      .replace(/^View (.+) roster$/, '$1');

    // A name already in use is refused before anything is sent.
    await page.getByRole('button', { name: 'New section' }).click();
    const name = page.getByLabel(/Section name/);
    await name.fill(existing);
    await expect(page.getByText(`A section named “${existing}” already exists.`)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create section' })).toBeDisabled();
    await evidence(page, testInfo, 'TC-DEAN-02-duplicate');

    await name.fill('QA 4-Z');
    await page.getByRole('button', { name: 'Create section' }).click();
    await expect(page.getByRole('button', { name: 'View QA 4-Z roster' })).toBeVisible();
    await evidence(page, testInfo, 'TC-DEAN-02-created');

    await page.getByRole('button', { name: 'Rename section QA 4-Z' }).click();
    await page.getByLabel(/Section name/).fill('QA 4-Y');
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(page.getByRole('button', { name: 'View QA 4-Y roster' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'View QA 4-Z roster' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Delete section QA 4-Y' }).click();
    await expect(page.getByText('Delete section QA 4-Y?')).toBeVisible();
    await page.getByRole('button', { name: 'Delete section', exact: true }).click();
    await expect(page.getByRole('button', { name: 'View QA 4-Y roster' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: `View ${existing} roster` })).toBeVisible();
  });

  test('TC-DEAN-03: the activity log downloads as a CSV file', async ({ page }, testInfo) => {
    await page.goto('/dean/audit');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Export page as CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toBe('icare-activity-log-page1.csv');
    const csv = readFileSync((await download.path())!, 'utf8');
    const lines = csv.trim().split('\n');
    expect(lines.length, 'a header and at least one entry').toBeGreaterThan(1);
    await observation(testInfo, 'TC-DEAN-03-csv', `${download.suggestedFilename()}, ${lines.length - 1} entries\n\n${lines.slice(0, 4).join('\n')}\n`);
  });

  test('TC-DEAN-04: the instructor report list filters to instructors with no sections', async ({ page }, testInfo) => {
    await page.goto('/dean/reports');
    await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
    await expect(page.getByRole('button', { name: /^Preview / }).first()).toBeVisible();
    const chip = page.getByRole('group', { name: 'Filter' }).getByRole('button', { name: /^No sections/ });
    const expected = Number((await chip.innerText()).match(/\d+/)![0]);
    await chip.click();
    await expect(chip).toHaveAttribute('aria-pressed', 'true');
    // Each instructor row has a preview; "All instructors" is not an instructor.
    await expect(page.getByRole('button', { name: /^Preview (?!All instructors)/ })).toHaveCount(expected);
    await evidence(page, testInfo, 'TC-DEAN-04-no-sections');
  });

  test('TC-DEAN-05: only the Dean can edit the ward layout', async ({ page, browser }, testInfo) => {
    await page.goto('/dean/wards');
    await expect(page.getByRole('heading', { level: 1, name: 'Wards' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Edit Layout' })).toBeVisible();
    await evidence(page, testInfo, 'TC-DEAN-05-dean-wards');

    const other = await browser.newPage();
    try {
      await startDemo(other, 'Instructor');
      await other.goto('/instructor/monitoring');
      await expect(other.getByRole('heading', { level: 1, name: 'Ward Management' })).toBeVisible();
      await expect(other.getByRole('button', { name: 'Room Layout' })).toBeVisible();
      await expect(other.getByRole('button', { name: 'Edit Layout' })).toHaveCount(0);
    } finally {
      await other.close();
    }
  });
});
