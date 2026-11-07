import { expect, test } from '@playwright/test';
import { evidence, sidewaysOverflow, startDemo } from './qa-helpers';

/**
 * Tasks done on a phone (the "phone" project, Pixel 7), in the demo:
 *   TC-UI-03  the menu button opens the navigation, and choosing a page closes it
 *   TC-UI-04  an instructor finds a student's report and previews it on a phone
 *   TC-UI-05  a Dean creates a section on a phone
 */

test('TC-UI-03: the menu button opens the navigation, and choosing a page closes it', async ({ page }, testInfo) => {
  await startDemo(page, 'Instructor');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  // Shut, the drawer sits off the left edge of the screen.
  await expect(nav).not.toBeInViewport();

  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(nav).toBeInViewport();
  await evidence(page, testInfo, 'TC-UI-03-menu-open');

  await nav.getByRole('link', { name: 'Quizzes' }).click();
  await expect(page).toHaveURL(/\/instructor\/assessments$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Quizzes' })).toBeVisible();
  await expect(nav).not.toBeInViewport();

  // The close button shuts it too.
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(nav).toBeInViewport();
  await page.getByRole('button', { name: 'Close navigation' }).click();
  await expect(nav).not.toBeInViewport();
});

test('TC-UI-04: an instructor finds a student’s report and previews it on a phone', async ({ page }, testInfo) => {
  await startDemo(page, 'Instructor');
  await page.goto('/instructor/reports');
  const previews = page.getByRole('button', { name: /^Preview / });
  const student = (await previews.first().getAttribute('aria-label'))!.replace(/^Preview /, '');

  await page.getByRole('searchbox').or(page.getByRole('textbox', { name: /^Search/ })).first().fill(student);
  await expect(previews).toHaveCount(1);
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
  await evidence(page, testInfo, 'TC-UI-04-found');

  await previews.first().click();
  const preview = page.getByRole('dialog');
  await expect(preview.getByRole('button', { name: 'Download PDF' })).toBeEnabled({ timeout: 20_000 });
  await evidence(page, testInfo, 'TC-UI-04-preview');
});

test('TC-UI-05: a Dean creates a section on a phone', async ({ page }, testInfo) => {
  await startDemo(page, 'Dean');
  await page.goto('/dean/student-management');
  await page.getByRole('button', { name: 'New section' }).click();
  await page.getByLabel(/Section name/).fill('QA phone section');
  const create = page.getByRole('button', { name: 'Create section' });
  await expect(create).toBeInViewport();
  await evidence(page, testInfo, 'TC-UI-05-form');
  await create.click();
  await expect(page.getByRole('button', { name: 'View QA phone section roster' })).toBeAttached();
  expect(await sidewaysOverflow(page)).toBeLessThanOrEqual(0);
});
