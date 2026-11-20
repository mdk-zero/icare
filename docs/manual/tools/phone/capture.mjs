#!/usr/bin/env node
/**
 * Takes the user manual's phone screenshots (SET-04 to SET-07, INS-17 and
 * STU-01 to STU-16) from the app's browser build, served with the mock API by
 * server.mjs. Every shot signs in through the app's own screens. See README.md.
 *
 *   node capture.mjs [--base http://localhost:3998] [--only set,stu-clinic,...] [--raw <folder>]
 *
 * Writes compressed PNGs into docs/manual/img/. A shot fails, and is not
 * written, when the app asked the mock for a route it doesn't know or tried
 * to reach anything off the mock's origin.
 */

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NOW, STUDENT, INSTRUCTOR, WRONG_ON, quizAnswerKey } from './fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../../..');
// Playwright and sharp come from the web app's dependencies.
const requireWeb = createRequire(path.join(repo, 'web', 'package.json'));
const { chromium } = requireWeb('playwright');
const sharp = requireWeb('sharp');

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BASE = arg('base', 'http://localhost:3998');
const ONLY = arg('only', '')?.split(',').filter(Boolean) ?? [];
const RAW = arg('raw', null);
const OUT = path.join(repo, 'docs', 'manual', 'img');
// The mock signs anyone in, so this is never checked; the masked field shows its length.
const PASSWORD = 'dummy-passwo';

const results = [];

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

async function mockState(state) {
  const res = await fetch(`${BASE}/__mock/state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state),
  });
  if (!res.ok) throw new Error(`The mock refused its state: ${res.status}`);
}

async function unknownRoutes() {
  const res = await fetch(`${BASE}/__mock/unknown`);
  return (await res.json()).unknown;
}

async function session(browser, state = {}) {
  await mockState(state);
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
    locale: 'en-US',
    timezoneId: 'Asia/Manila',
    colorScheme: 'light',
    reducedMotion: 'reduce',
  });
  await context.clock.setFixedTime(NOW);
  const offOrigin = [];
  const origin = new URL(BASE).origin;
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (new URL(url).origin === origin) return route.continue();
    offOrigin.push(url);
    return route.abort();
  });
  const page = await context.newPage();
  page.on('pageerror', (err) => console.warn(`  page error: ${err.message}`));
  await page.goto(`${BASE}/student/`);
  return { context, page, offOrigin };
}

async function settle(page, ms = 700) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
}

// Screens stay mounted under the one in front, so only a visible match counts.
const text = (page, value) => page.getByText(value, { exact: true }).filter({ visible: true }).first();

async function passWelcome(page) {
  await page.getByRole('checkbox').waitFor();
  await page.getByRole('checkbox').click();
  await settle(page, 400);
}

async function fillSignIn(page, email) {
  await page.getByRole('button', { name: 'Continue' }).click();
  await text(page, 'Welcome back').waitFor();
  await page.getByPlaceholder('email@example.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(PASSWORD);
  // Off the fields, so neither shows its focus ring.
  await text(page, 'Welcome back').click();
  await settle(page, 400);
}

async function signIn(page, email) {
  await passWelcome(page);
  await fillSignIn(page, email);
  await text(page, 'Sign In').click();
}

// ---------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------

/** Scrolls the nearest scrolling container so `locator` sits `top` px below the viewport's top. */
async function scrollTo(locator, top) {
  await locator.evaluate((el, offset) => {
    let box = el.parentElement;
    while (box && !(box.scrollHeight > box.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) {
      box = box.parentElement;
    }
    if (!box) return;
    const delta = el.getBoundingClientRect().top - offset;
    box.scrollTop += delta;
  }, top);
  await locator.page().waitForTimeout(500);
}

/** The union of the boxes, 16 px wider each side, kept inside the page. */
async function clipAround(page, locators) {
  const boxes = [];
  for (const l of locators) boxes.push(await l.boundingBox());
  const vp = page.viewportSize();
  const x = Math.max(0, Math.min(...boxes.map((b) => b.x)) - 16);
  const y = Math.max(0, Math.min(...boxes.map((b) => b.y)) - 16);
  const right = Math.min(vp.width, Math.max(...boxes.map((b) => b.x + b.width)) + 16);
  const bottom = Math.min(vp.height, Math.max(...boxes.map((b) => b.y + b.height)) + 16);
  return { x, y, width: right - x, height: bottom - y };
}

/** Below the floating app header. */
const BELOW_HEADER = 112;
/** Room kept clear of the floating tab bar. */
const ABOVE_TABS = 120;

/**
 * Clips from the top of `first` to the bottom of `last`. A region taller than
 * the screen gets a taller viewport (same width), as the capture rules allow.
 */
async function region(page, first, last) {
  await scrollTo(first, BELOW_HEADER);
  const a = await first.boundingBox();
  const b = await last.boundingBox();
  const needed = b.y + b.height - a.y + 32;
  const vp = page.viewportSize();
  if (BELOW_HEADER + needed > vp.height - ABOVE_TABS) {
    await page.setViewportSize({ width: vp.width, height: Math.ceil(BELOW_HEADER + needed + ABOVE_TABS) });
    await page.waitForTimeout(600);
    await scrollTo(first, BELOW_HEADER);
  }
  return clipAround(page, [first, last]);
}

async function shot(s, id, file, clip) {
  const { page, offOrigin } = s;
  await settle(page);
  const unknown = await unknownRoutes();
  const problems = [
    ...unknown.map((u) => `unmocked ${u}`),
    ...offOrigin.map((u) => `off-origin ${u}`),
  ];
  if (problems.length) {
    results.push({ id, file, ok: false, problems });
    console.error(`✖ ${id} ${file}\n    ${problems.join('\n    ')}`);
    return;
  }
  const raw = await page.screenshot(clip ? { clip } : {});
  if (RAW) {
    mkdirSync(RAW, { recursive: true });
    writeFileSync(path.join(RAW, file.replace(/\//g, '__')), raw);
  }
  const png = await sharp(raw).png({ palette: true, quality: 90, effort: 10, compressionLevel: 9 }).toBuffer();
  const target = path.join(OUT, file);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, png);
  results.push({ id, file, ok: true, bytes: png.length });
  console.log(`✔ ${id} ${file} (${Math.round(png.length / 1024)} KB)`);
}

// ---------------------------------------------------------------------------
// The groups of shots, each in its own browser context
// ---------------------------------------------------------------------------

const GROUPS = {
  /** SET-04, SET-05: first launch, signed out. */
  async set(browser) {
    const s = await session(browser);
    await passWelcome(s.page);
    await shot(s, 'SET-04', 'setup/04-app-welcome.png');
    await fillSignIn(s.page, STUDENT.email);
    await shot(s, 'SET-05', 'setup/05-app-sign-in.png');
    await s.context.close();
  },

  /** SET-06: an account with a temporary password. */
  async 'set-password'(browser) {
    const s = await session(browser, { forcePasswordChange: true });
    await signIn(s.page, STUDENT.email);
    await text(s.page, 'Set a new password').waitFor();
    await shot(s, 'SET-06', 'setup/06-app-set-new-password.png');
    await s.context.close();
  },

  /** SET-07: a student who hasn't answered the AI question. */
  async 'set-ai'(browser) {
    const s = await session(browser, { aiConsent: null });
    await signIn(s.page, STUDENT.email);
    await text(s.page, 'Allow AI features?').waitFor();
    await shot(s, 'SET-07', 'setup/07-app-ai-question.png');
    await s.context.close();
  },

  /** STU-01 to STU-06: Home, the ward, a case and the Return Demonstration. */
  async 'stu-clinic'(browser) {
    const s = await session(browser);
    const { page } = s;
    await signIn(page, STUDENT.email);
    await text(page, 'NEXT UP').waitFor();
    await text(page, 'Course Requirements').waitFor();
    await shot(s, 'STU-01', 'student/01-home.png');

    // Home > NEXT UP opens the case on its Before you start screen.
    await text(page, 'Fever Workup: Temperature, Pulse and Respirations').click();
    await text(page, 'Before you start').waitFor();
    await page.getByText('4 tasks to demonstrate').first().waitFor();
    await shot(s, 'STU-03', 'student/03-before-you-start.png');
    await text(page, 'Not yet').click();
    await text(page, 'NEXT UP').waitFor();

    await page.getByRole('tab', { name: 'Clinic' }).click();
    await text(page, 'Room Layout').waitFor();
    await text(page, 'Asthma: Pulse Oximetry, Respirations and Nasal Cannula Oxygen').waitFor();
    // The plan's rooms just under the app header, and Pending Tasks above the tab bar.
    await scrollTo(text(page, 'Room Layout'), 40);
    await shot(s, 'STU-02', 'student/02-clinic.png');

    await text(page, 'Asthma: Pulse Oximetry, Respirations and Nasal Cannula Oxygen').click();
    await text(page, 'Clinical Tasks').waitFor();
    await text(page, 'Request instructor assistance').waitFor();
    // The tasks and the help button; the timer sits above, out of frame.
    await scrollTo(text(page, 'Clinical Tasks'), 80);
    await shot(s, 'STU-04', 'student/04-case-in-progress.png');
    await page.goBack();
    await text(page, 'Room Layout').waitFor();

    await text(page, 'Hospital Cases').click();
    await text(page, 'Write up a patient from your duty — initials only').waitFor();
    await page.getByRole('button', { name: /^Case Presentation 1: A patient from your first ward week/ }).last().click();
    await text(page, 'Group slides').waitFor();
    await shot(s, 'STU-06', 'student/06-case-presentation.png');
    await page.goBack();

    await page.getByRole('tab', { name: 'Demos' }).click();
    await text(page, 'Return Demos').waitFor();
    // Home keeps its own copy of the title mounted below; this is the Demos card.
    await page.getByText('Vital Signs Return Demonstration', { exact: true }).filter({ visible: true }).last().click();
    await text(page, 'Skills to demonstrate').waitFor();
    await text(page, 'PhilPEN Form').waitFor();
    await shot(s, 'STU-05', 'student/05-return-demo.png');
    await s.context.close();
  },

  /** STU-07 to STU-11: a quiz from the list to the reflection. */
  async 'stu-quiz'(browser) {
    const s = await session(browser);
    const { page } = s;
    await signIn(page, STUDENT.email);
    await text(page, 'NEXT UP').waitFor();
    await page.getByRole('tab', { name: 'Quizzes' }).click();
    await text(page, 'A Full Set of Vital Signs').waitFor();
    await shot(s, 'STU-07', 'student/07-quizzes.png');

    await text(page, 'A Full Set of Vital Signs').click();
    await text(page, 'Start quiz').waitFor();
    await shot(s, 'STU-08', 'student/08-quiz-details.png');

    await text(page, 'Start quiz').click();
    const key = quizAnswerKey();
    for (let i = 0; i < key.length; i++) {
      const q = key[i];
      await text(page, q.content).waitFor();
      const pick = WRONG_ON.includes(q.id) ? (q.correct_index + 1) % q.options.length : q.correct_index;
      await text(page, q.options[pick]).click();
      await page.waitForTimeout(250);
      if (i === 2) await shot(s, 'STU-09', 'student/09-quiz-question.png');
      if (i < key.length - 1) await page.getByRole('button', { name: 'Next' }).click();
    }
    await page.getByRole('button', { name: 'Submit' }).click();
    const dialog = page.getByRole('alertdialog');
    await dialog.waitFor();
    await dialog.getByText('Submit', { exact: true }).click();
    await text(page, 'Passed').waitFor();
    await text(page, 'Reflect on your results').waitFor();
    await shot(s, 'STU-10', 'student/10-quiz-result.png');

    const card = page.locator('div', { has: text(page, 'Reflect on your results') })
      .filter({ has: page.getByText('Save reflection', { exact: true }) })
      .last();
    await scrollTo(card, 40);
    await shot(s, 'STU-11', 'student/11-reflection.png', await clipAround(page, [card]));
    await s.context.close();
  },

  /** STU-12, STU-13: the Library and the study tips. */
  async 'stu-library'(browser) {
    const s = await session(browser);
    const { page } = s;
    await signIn(page, STUDENT.email);
    await text(page, 'NEXT UP').waitFor();
    await page.getByRole('tab', { name: 'Library' }).click();
    await text(page, 'Chapter 1').waitFor();
    await shot(s, 'STU-12', 'student/12-library.png');

    await text(page, 'Recommendations & study tips').click();
    await text(page, 'Needs improvement').waitFor();
    await page.getByRole('button', { name: 'Skill 1-7, Assessing Brachial Artery Blood Pressure' }).click();
    // Its button's name also carries the icon's glyph, so find it by its words.
    await text(page, 'Study tip').click();
    await text(page, 'Estimate the systolic pressure first').waitFor();
    const clip = await region(
      page,
      page.getByRole('button', { name: /Recommendations & study tips/ }),
      page.getByRole('button', { name: 'Skill 1-4, Assessing a Peripheral Pulse by Palpation' }),
    );
    await shot(s, 'STU-13', 'student/13-study-tips.png', clip);
    await s.context.close();
  },

  /** STU-14 to STU-16: Performance, Profile and Notifications. */
  async 'stu-profile'(browser) {
    const s = await session(browser);
    const { page } = s;
    await signIn(page, STUDENT.email);
    await text(page, 'NEXT UP').waitFor();
    await text(page, 'Avg Score').click();
    await text(page, 'Overall Score').waitFor();
    await shot(s, 'STU-14', 'student/14-performance.png');
    await page.goBack();
    await text(page, 'NEXT UP').waitFor();

    await page.getByRole('button', { name: 'Profile', exact: true }).click();
    await text(page, 'My Goals').waitFor();
    await text(page, 'Count every irregular pulse for a full minute').waitFor();
    // The innermost boxes holding the header card's lines and both goals.
    const card = page.locator('div').filter({ has: text(page, STUDENT.email) }).filter({ has: text(page, 'Student') }).last();
    const goalsCard = page.locator('div')
      .filter({ has: text(page, 'Count every irregular pulse for a full minute') })
      .filter({ has: text(page, 'Support the arm at heart level before taking a blood pressure') })
      .last();
    const cardBox = await card.boundingBox();
    const goalsBox = await goalsCard.boundingBox();
    // Profile opens scrolled to the top, with the card just under the app header: start the crop below the header.
    const top = Math.max(cardBox.y - 6, 82);
    // The full width: the cards sit 16 px in from each edge.
    const profileClip = { x: 0, y: top, width: 390, height: goalsBox.y + goalsBox.height + 16 - top };
    await shot(s, 'STU-15', 'student/15-profile.png', profileClip);

    await page.getByRole('button', { name: /^Notifications/ }).click();
    await text(page, 'Mark all read').waitFor();
    await shot(s, 'STU-16', 'student/16-notifications.png');
    await s.context.close();
  },

  /** INS-17: the Instructor's Courses tab. */
  async ins(browser) {
    const s = await session(browser, { role: 'faculty' });
    await signIn(s.page, INSTRUCTOR.email);
    await text(s.page, 'NCM 112L').waitFor();
    await shot(s, 'INS-17', 'instructor/17-app-courses.png');
    await s.context.close();
  },
};

const browser = await chromium.launch();
try {
  for (const [name, run] of Object.entries(GROUPS)) {
    if (ONLY.length && !ONLY.includes(name)) continue;
    console.log(`— ${name}`);
    // A step can now and then miss its moment in a headless browser: a group that fails gets one more go.
    for (let attempt = 1; attempt <= 2; attempt++) {
      const before = results.length;
      try {
        await run(browser);
        break;
      } catch (err) {
        console.error(`✖ ${name} (attempt ${attempt}): ${err.message.split('\n').slice(0, 4).join('\n    ')}`);
        if (attempt === 2) results.push({ id: name, ok: false, problems: [err.message.split('\n')[0]] });
        else results.splice(before);
      }
    }
  }
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
const total = results.filter((r) => r.ok).reduce((sum, r) => sum + r.bytes, 0);
console.log(`\n${results.length - failed.length} written, ${failed.length} failed, ${Math.round(total / 1024)} KB in all.`);
if (failed.length) process.exitCode = 1;
