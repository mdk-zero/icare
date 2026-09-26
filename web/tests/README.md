# Automated tests

Two suites, both run against a **running** iCARE++ web app (local `npm run dev`, or a
deployment). Neither creates, edits nor deletes data, so they are safe to point at the live
site. Signing in does update each test account's "last sign-in" time.

| Suite | Tool | What it checks | Files |
|---|---|---|---|
| Frontend (end-to-end) | [Playwright](https://playwright.dev) | A real Chromium browser opens pages, signs in, clicks through each portal and checks what is shown, including which portals each role is kept out of. | `playwright.config.ts`, `tests/e2e/*.spec.ts` |
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
npm run test:api          # Postman collection through Newman
npm run test:e2e:report   # same, and send the results to /super-admin/tests
npm run test:api:report
```

The `:report` variants sign in as the super admin account from `.env.test` and save the run.
It then shows under **Test Results → Frontend tests / API tests**, next to the health checks
and benchmarks. Set `TEST_REPORT_URL` to report to a different deployment from the one
tested. Saving needs migration 054 on that database.

Useful Playwright options: `npx playwright test --headed` (watch it), `--ui` (step through),
`npx playwright show-report` (open the last HTML report).

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
