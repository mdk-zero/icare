# Automated tests

Two suites, both run against a **running** iCARE++ web app (local `npm run dev`, or a
deployment). Against localhost, Playwright starts `npm run dev` itself when nothing is running
there and stops it afterwards; the Postman suite needs it started by hand. Neither creates, edits nor deletes app data, so they are safe to point at the live
site. Playwright tests that do change things (create a section, publish a note, delete an
instructor) run in the demo, which keeps every change in the browser and never calls the API.
Signing in does update each test account's "last sign-in" time, and the Playwright
health-check test saves one health-check run to System Tests (its AI checks only look models
up, so they spend no AI quota).

An account holds one live web session and one live mobile session (migration 079), and each
sign-in signs out the one before it on the same platform. So Playwright signs each role in
**once** per run, in its `setup` project, and every test of that role shares the session
(saved in `tests/.auth/`, gitignored). That also keeps a run well inside the login limit of
20 attempts per address and 10 per email in 15 minutes: a run signs in about seven times. The
`session` project runs last, because its sign-in replaces the Dean session the others share.
The staff sign-ins in both suites are web sessions, and the `:report` reporter's is a mobile
one, so it is never signed out by the tests it reports on. Don't use a test account by hand
while a suite runs (it will be signed out), and run one `:report` suite at a time: two
reporters share the super admin's mobile session.

| Suite | Tool | What it checks | Files |
|---|---|---|---|
| Frontend (end-to-end) | [Playwright](https://playwright.dev) | A real Chromium browser opens pages, signs in, clicks through each portal and checks what is shown, including which portals each role is kept out of, at desktop and phone size. | `playwright.config.ts`, `tests/e2e/*.spec.ts` |
| API | [Postman](https://www.postman.com) collection, run by [Newman](https://github.com/postmanlabs/newman) | Status codes, response shapes, validation and role restrictions of the `/api` routes, including the mobile app's. | `tests/api/icare-api.postman_collection.json` |

## Setup (once)

```bash
cd web
npm install
npx playwright install chromium     # the browser Playwright drives
cp .env.test.example .env.test      # then fill it in
```

In `.env.test`, set `TEST_BASE_URL` and an email/password for each role you want covered:
super admin, admin, faculty, student. Use **dedicated test accounts** with their password
already set. An account still on a temporary password is sent to "change password" and its
tests fail. A role left blank has its tests **skipped**, not failed. Keep `.env.test` out of
git (it is gitignored).

## Running

```bash
npm run test:e2e          # Playwright; HTML report in playwright-report/
npm run test:e2e:live     # Playwright against https://www.i-care.dev
npm run test:api          # Postman collection through Newman
npm run test:e2e:report   # same, and send the results to /admin/tests
npm run test:api:report
```

The `:report` variants sign in as the super admin account from `.env.test` and save the run.
It shows under **System Tests → Frontend tests / API tests**, next to the health checks and
benchmarks, live: each test appears there as it finishes, with a progress bar, and the run
turns into the usual summary when it ends. A run that stops sending (Ctrl+C, a crash) shows
as stopped. Set `TEST_REPORT_URL` to report to a different deployment from the one
tested. Saving needs migration 054 on that database.

Useful Playwright options: `npx playwright test --headed` (watch it), `--ui` (step through),
`npx playwright show-report` (open the last HTML report), `npx playwright test sign-in demo`
(only those files), `--project=phone` (only the phone tests), `--no-deps` (skip the sign-ins
and reuse the last run's sessions, for tests that need no account).

## Playwright test cases

Every test records a trace, a video and a screenshot, pass or fail, all in the HTML report
(the sign-in steps excepted, so no password lands in a trace). The test-case specs below also
save screenshots at the moments that matter, and short text records of what they observed,
to `qa/evidence/` (gitignored, since signed-in pages show real names), named by test-case ID
for a QA report to quote. Each spec lists its test cases at the top.

| Spec | Test cases | Signed in as |
|---|---|---|
| `auth.setup.ts` | TC-AUTH-01 sign in through the form (plus the other roles' sign-ins) | each staff role |
| `sign-in.spec.ts` | TC-AUTH-02 to 07: empty form, wrong password, student turned away, password recovery, signed-out redirects, contact form | nobody (one student and one wrong-password attempt) |
| `public-pages.spec.ts` | TC-PUB-01 to 05: public pages, landing links, not-found page, app download link, sign-in links | nobody |
| `demo.spec.ts` | TC-DEMO-01 to 03: the demo portals, no API calls from the demo, logging out of it | demo |
| `instructor.spec.ts` | TC-INS-01 every page (real account); TC-INS-02 to 06: search, reports, Library, Help, quiz results | faculty, then demo |
| `dean.spec.ts` | TC-DEAN-01 every page (real account); TC-DEAN-02 to 05: sections, CSV export, reports, ward layout | admin, then demo |
| `admin.spec.ts` | TC-ADM-01 every page; TC-ADM-02 kept out of the teaching portals | super admin |
| `appearance.spec.ts` | TC-UI-01, 02: the colour theme | demo |
| `accessibility.spec.ts` | TC-A11Y-01 to 04: every button and link has a name; the sign-in form's labels | nobody, then demo |
| `layout.spec.ts` (phone) | TC-LAY-01 to 04: every page fits a Pixel 7 without sideways scrolling | nobody, demo, super admin |
| `phone-flows.spec.ts` (phone) | TC-UI-03 to 05: the menu drawer, a report and a new section on a phone | demo |
| `session.spec.ts` (last) | TC-SES-01: a newer sign-in signs out the older browser; logging out ends the session; `?next=` stays on the site | admin |

`auth.spec.ts`, `staff.spec.ts`, `super-admin.spec.ts` and `dean-instructors.spec.ts` are the
earlier tests, without test-case IDs.

The projects in `playwright.config.ts`: `setup` (the sign-ins), `desktop` (Desktop Chrome, every
spec but the phone ones), `phone` (Pixel 7: `layout` and `phone-flows`) and `session`.

## Using the Postman app instead

Import `tests/api/icare-api.postman_collection.json` and
`tests/api/icare-api.postman_environment.json`. Fill in the environment's `base_url` and
account variables, then use **Run collection**. The folders are:

1. **Public endpoints**: health probe, signed-out session, sign-in validation.
2. **Access control while signed out**: every protected route answers 401; the developer API
   stays hidden (404).
3. **Super admin**: account list, validation, the self-demotion and self-deletion guards,
   dashboard, metrics, test-run history, benchmark probes.
4. **Admin**: sees only students and faculty, can't create admins, is kept out of the super
   admin API.
5. **Faculty**: own dashboard and students; admin and super admin APIs forbidden.
6. **Student (mobile app API)**: patients, notifications, profile; staff APIs forbidden.

Every request turns cookies off on purpose. A sign-in sets the session cookie, and the server
reads the cookie before the bearer token, so with cookies on, the last role signed in would
answer for all of them.

## CI

`.github/workflows/tests.yml` runs both suites against a deployment on demand (Actions →
*Tests* → *Run workflow*). It reads the same `TEST_*` values from repository secrets.
