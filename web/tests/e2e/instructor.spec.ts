import { expect, test } from '@playwright/test';
import { signedInAs, signIn } from './helpers';
import { evidence, observation, startDemo, visitEverySidebarPage, watchProblems } from './qa-helpers';

/**
 * The Instructor portal. TC-INS-01 reads the real test account's pages and
 * changes nothing; the rest run in the demo, where changes stay in the browser:
 *   TC-INS-01  every page in the sidebar opens, with no errors (real account)
 *   TC-INS-02  patient cases can be searched and filtered
 *   TC-INS-03  sections are ranked by low performers, and a student's report previews from one
 *   TC-INS-04  a study material is published to the Library
 *   TC-INS-05  Help & Support sends nothing until the request is complete
 *   TC-INS-06  a quiz's results open from the quiz list
 */

test.describe('Instructor, real account', () => {
  signedInAs('faculty');

  test('TC-INS-01: every page in the Instructor sidebar opens, with no errors', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    const problems = watchProblems(page);
    await signIn(page, 'faculty');
    const seen = await visitEverySidebarPage(page);
    expect(problems, 'errors while browsing').toEqual([]);
    await page.goto('/instructor');
    await evidence(page, testInfo, 'TC-INS-01-overview');
    await observation(testInfo, 'TC-INS-01-pages', `Sidebar link             Address                            Heading shown\n${seen.join('\n')}\n`);
  });
});

test.describe('Instructor, demo', () => {
  test.beforeEach(async ({ page }) => {
    await startDemo(page, 'Instructor');
  });

  test('TC-INS-02: patient cases can be searched and filtered', async ({ page }, testInfo) => {
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Patient Cases' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Patient Cases' })).toBeVisible();
    const cases = page.getByRole('heading', { level: 3 });
    await expect(cases.first()).toBeVisible();
    const total = await cases.count();
    expect(total, 'demo patient cases').toBeGreaterThan(1);

    await page.getByPlaceholder('Search patient cases...').fill('Cellulitis');
    await expect(cases).toHaveCount(1);
    await expect(cases.first()).toContainText('Cellulitis');
    await evidence(page, testInfo, 'TC-INS-02-search');

    await page.getByPlaceholder('Search patient cases...').fill('');
    await expect(cases).toHaveCount(total);

    // A chapter filter keeps only the cases tagged with it.
    await page.getByRole('combobox', { name: 'Filter by chapter' }).selectOption({ label: 'Ch. 15 · Fluid, Electrolyte, and Acid–Base Balance' });
    const filtered = await cases.count();
    expect(filtered).toBeGreaterThan(0);
    expect(filtered).toBeLessThan(total);
    for (const card of await page.getByRole('region').filter({ has: cases }).all()) {
      await expect(card.getByText('Ch. 15 · Fluid, Electrolyte, and Acid–Base Balance').first()).toBeVisible();
    }
  });

  test('TC-INS-03: sections are ranked by low performers, and a student’s report previews from one', async ({ page }, testInfo) => {
    await page.goto('/instructor/reports');
    await expect(page.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible();
    // Sections are folders, with the most low performers first by default.
    await expect(page.getByRole('group', { name: 'Sort' }).getByRole('button', { name: 'Most low performers' })).toHaveAttribute('aria-pressed', 'true');
    const folders = page.getByRole('button', { name: /^Open (?!navigation$)/ });
    await expect(folders.first()).toBeVisible();
    const sections = await Promise.all(
      (await folders.all()).map(async (folder) => {
        const text = await folder.innerText();
        return {
          name: (await folder.getAttribute('aria-label'))!.replace(/^Open /, ''),
          low: Number(text.match(/(\d+) low performing/)?.[1] ?? 0),
          students: Number(text.match(/(\d+) students?/)![1]),
        };
      }),
    );
    expect(sections.length, 'demo sections').toBeGreaterThan(1);
    expect(sections[0].low, 'low performers in the first section').toBeGreaterThan(0);
    const lows = sections.map((s) => s.low);
    expect(lows, 'most low performers first').toEqual([...lows].sort((a, b) => b - a));
    await evidence(page, testInfo, 'TC-INS-03-sections');

    // Opening the first lists one report per student in it, beside the whole section's.
    await folders.first().click();
    await expect(page.getByRole('group', { name: 'Report by' }).getByRole('button', { name: /^Per student/ })).toHaveAttribute('aria-pressed', 'true');
    const previews = page.getByRole('button', { name: /^Preview (?!Whole section)/ });
    await expect(previews).toHaveCount(sections[0].students);
    await expect(page.getByRole('button', { name: `Preview Whole section: ${sections[0].name}` })).toBeVisible();

    const first = previews.first();
    const student = (await first.getAttribute('aria-label'))!.replace(/^Preview /, '');
    await first.click();
    const preview = page.getByRole('dialog');
    await expect(preview).toBeVisible();
    await expect(preview.getByRole('button', { name: 'Download PDF' })).toBeEnabled({ timeout: 20_000 });
    await evidence(page, testInfo, 'TC-INS-03-preview');
    await preview.getByRole('button', { name: 'Close preview' }).click();
    await expect(preview).toBeHidden();
    await observation(
      testInfo,
      'TC-INS-03-sections',
      `${sections.map((s) => `${s.name}: ${s.low} low performing of ${s.students}`).join('\n')}\nOpened: ${sections[0].name}\nPreviewed: ${student}\n`,
    );
  });

  test('TC-INS-04: a study material is published to the Library', async ({ page }, testInfo) => {
    await page.goto('/instructor/library');
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible();
    await page.getByRole('button', { name: 'Note', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Add material' })).toBeVisible();

    const title = 'QA note: taking an oral temperature';
    await page.locator('#lib-note').fill('## Key points\n- Wait 15 minutes after the patient eats or drinks.');
    await page.locator('#lib-title').fill(title);
    await page.getByRole('button', { name: 'Publish', exact: true }).click();

    await expect(page.getByRole('heading', { name: 'Add material' })).toBeHidden();
    await expect(page.getByText(title)).toBeVisible();
    await evidence(page, testInfo, 'TC-INS-04-published');
  });

  test('TC-INS-05: Help & Support sends nothing until the request is complete', async ({ page }, testInfo) => {
    await page.goto('/instructor/help');
    const send = page.getByRole('button', { name: 'Send Message' });
    await expect(send).toBeDisabled();

    // The radio itself is hidden; its label is what a person clicks.
    await page.locator('label').filter({ hasText: "Something isn't working" }).click();
    await expect(page.getByLabel("Something isn't working")).toBeChecked();
    await expect(send).toBeDisabled();
    await page.locator('#support-subject').fill('The grade did not save');
    await expect(send).toBeDisabled();
    await page.locator('#support-message').fill('I pressed Save and the grade went back to blank.');
    await expect(send).toBeEnabled();
    await evidence(page, testInfo, 'TC-INS-05-ready');

    // The demo has no inbox for a reply, so it refuses and says so.
    await send.click();
    await expect(page.getByText('Not available in the demo').first()).toBeVisible();
  });

  test('TC-INS-06: a quiz’s results open from the quiz list', async ({ page }, testInfo) => {
    await page.goto('/instructor/assessments');
    await expect(page.getByRole('heading', { level: 1, name: 'Quizzes' })).toBeVisible();
    await page.getByRole('button', { name: 'Results' }).first().click();
    await expect(page).toHaveURL(/\/instructor\/assessments\/[^/]+\/results/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await evidence(page, testInfo, 'TC-INS-06-results');
  });
});
