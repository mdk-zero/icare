# Setting up and running iCARE++

This guide is for the technical team that installs, deploys and looks after iCARE++: the
database, the web portal, the ML service and the mobile app. It assumes you can use a terminal,
git and the hosting dashboards. It describes the system with every migration in
`web/supabase/migrations/` applied. If you use iCARE++ rather than run it, start with
[Getting started with iCARE++](setup-1-getting-started.md).

In this guide:

- [What runs where](#what-runs-where)
- [Before you start](#before-you-start)
- [Supabase](#supabase)
- [Web portal on Vercel](#web-portal-on-vercel)
- [ML service on Render](#ml-service-on-render)
- [Mobile app with Expo EAS](#mobile-app-with-expo-eas)
- [GitHub Actions](#github-actions)
- [Local development](#local-development)
- [Routine operations](#routine-operations)
- [Troubleshooting](#troubleshooting)

> [!IMPORTANT]
> The repository is public. Never commit a key, password or token, and never paste one into an
> issue or a document. This guide names variables only. Real values live in the hosting
> dashboards and in local `.env` files that git ignores.

## What runs where

| Part | Runs on | What it does | Set up in |
|---|---|---|---|
| Database and files | Supabase, in the Singapore region | Postgres holds the app's tables and the `dw` data warehouse behind the analytics. Storage holds uploaded files. | [Supabase](#supabase) |
| Web portal and API | Vercel, region `sin1` (set in `web/vercel.json`) | The `web/` Next.js app: the Admin, Dean and Instructor portals, and the `/api` routes that both the portals and the mobile app call. | [Web portal on Vercel](#web-portal-on-vercel) |
| ML service | Render, as a Docker service in region `singapore` (set in `render.yaml`) | The `ml/` FastAPI service: the nightly Low performing prediction, skill mastery estimates and model retraining. | [ML service on Render](#ml-service-on-render) |
| Mobile app | Expo EAS | Android builds (an APK) and over-the-air updates. | [Mobile app with Expo EAS](#mobile-app-with-expo-eas) |
| Checks and scheduled jobs | GitHub Actions | CI on every push, the nightly ML run, and the test suites. | [GitHub Actions](#github-actions) |
| Email | Resend, or any SMTP server | Welcome emails, sign-in codes, announcements and support replies. | [Email](#email) |
| AI | Anthropic's Claude first, then Google Gemini and OpenRouter as fallbacks | Summaries, study tips, feedback, and reading a curriculum PDF. | [Environment variables](#environment-variables) |
| Google sign-in | A Google Cloud OAuth client | Signing in to the web portal with Google. | [Google sign-in](#google-sign-in) |
| Error reports | Sentry | Errors from the web portal. | [Environment variables](#environment-variables) |
| Push notifications | Expo's push service, called from the database | Notifications on phones when the app is closed. | Migration 072 |

Only servers talk to Supabase. The mobile app and the browser call the web portal's `/api`
routes, and the web portal calls Supabase with the service role key. The ML service is reached
only by the web portal and the nightly GitHub workflow, and every request must carry the shared
secret `ML_SERVICE_SECRET`.

Put the three hosts close together. Every API request makes several database round trips, so
pick the Supabase region first, then set `web/vercel.json` and `render.yaml` to the nearest
region each host offers. Changing either file is a code change, so commit it.

## Before you start

**Accounts:**

- GitHub, with access to the repository.
- Supabase, Vercel and Render.
- Expo, with access to the EAS project that `mobile/app.json` points at.
- An email provider: Resend (needs a domain whose DNS you control) or an SMTP server.
- Anthropic, for Claude. Google AI Studio (Gemini) and OpenRouter are optional fallbacks.
- Google Cloud, if you want Google sign-in on the web portal.
- Sentry, if you want error reports.

**Tools:**

- Node.js 22, the version CI uses.
- npm 11 for `web/` lockfiles. Regenerate `web/package-lock.json` with `npx -y npm@11 install`,
  never with an older npm.
- Python 3.12, the version in `ml/Dockerfile`.
- eas-cli 21 or later (`mobile/eas.json` asks for it). Install it with `npm install -g eas-cli`,
  or run it through `npx eas-cli@latest`.
- bash, for `start.sh` and `check.sh`. On Windows, use Git Bash or WSL.

## Supabase

### Create the project

1. In Supabase, create a new project in the region you chose in
   [What runs where](#what-runs-where).
2. Keep the database password in your team's password manager.
3. Go to **Project Settings** > **API**. Copy the project URL (for `SUPABASE_URL`) and the
   `service_role` key (for `SUPABASE_SERVICE_ROLE_KEY`). The service role key gets past every
   row-level security rule, so it goes only on servers and in ignored `.env` files.
4. Optional: Go to **Database** > **Extensions** and turn on `pg_cron` before you apply the
   migrations. Migration 096 then schedules a data warehouse refresh every 5 minutes (it replaces
   the nightly job that migration 014 set up). If you turn `pg_cron` on after applying 096, run
   096 again. Without `pg_cron` nothing breaks: the analytics routes refresh the warehouse in
   the background when it is more than 5 minutes old, one refresh at a time.

### Apply the database schema and migrations

There is no migration tool. You apply every file by hand in the Supabase SQL editor.

To build the database on a new project:

1. In Supabase, open the **SQL Editor** and start a new query.
2. Paste the whole of `web/supabase/schema.sql` and run it.
3. Run each file in `web/supabase/migrations/` in number order, from `001` to the highest
   number, one file per run.
4. Run 054 and 055 as two separate runs. 054 adds the Admin role to an enum, and Postgres can't
   use a new enum value in the same transaction. Before you run 055, read
   [Create the first Admin](#create-the-first-admin).
5. Load the Skills catalog. In `web/`, with `web/.env.local` pointing at the new project (see
   [Environment files](#environment-files)), run:

   ```sh
   npx tsx scripts/seed-taylor-skills.ts
   ```

   Without it the Skills lists are empty, and Patient Cases and Return Demonstrations have no
   skills to build from. It's safe to run again.

6. Optional: Load the suggested Library videos that Instructors can publish:

   ```sh
   npx tsx scripts/seed-library-suggestions.ts
   ```

> [!NOTE]
> This order (`schema.sql`, then `001` onward) was read from the files. It has not been tested on
> an empty project. `web/supabase/context.sql` is a reference copy of the tables. It is not meant
> to be run.

On a new project, two migrations do more than build tables:

- **055** promotes the original team's accounts to Admin. Change it first; see
  [Create the first Admin](#create-the-first-admin).
- **077** adds an institution called "iCARE++ Test Institution" (code `ICARE-TEST`), which holds
  the simulated class. The ML service leaves this institution's students out of training, so
  never put real students in it. 077's other data steps only touch accounts from the original
  install, so they change nothing on a new project.

**Writing a new migration.** Give it the next free number; `./check.sh` fails when two files
share a number. Make it safe to run twice (`if not exists`, `on conflict do nothing`). An
`UPDATE` or `DELETE` that touches every row needs `where true`: Supabase refuses a bare one when
the function runs through the API (migration 086 fixed one).

**The live database can drift from the files.** It has been changed by hand at times. Before
you count on a migration being live, look for what it adds. For example, this returns one row
when 092 is applied:

```sql
select column_name
from information_schema.columns
where table_schema = 'public' and table_name = 'users' and column_name = 'ai_consent';
```

### Migrations that change what users see

The app checks for most newer migrations and says so when one is missing, instead of failing.
This table lists the ones whose absence users notice.

| Feature | Migration | What users see without it |
|---|---|---|
| Groups within a section | 048 | Groups can't be made. The request fails with a message naming 048. |
| An Instructor for each group | 051 | Groups have no Instructor. Assigning one fails with a message naming 051. |
| The Admin role, request timings and test history | 054 | There is no Admin role at all. Admin pages that read timings or test runs say "Migration 054 isn't applied yet". |
| Signing out old sessions after a password reset or role change; shared sign-in limits | 059 | Old sessions keep working until they expire (7 days). Sign-in attempt limits count per server instead of across all of them. With it, the limits are 10 attempts per account and 300 per address in 15 minutes. |
| Push notifications on phones | 072 | Phones show notifications only while the app is open. |
| One web session and one phone session per account | 079 | Several sign-ins to one account stay live at once. |
| AI token counts and costs | 076 | The AI usage card on the Admin Dashboard says "Migration 076 isn't applied yet". |
| Program Chairs | 080 | A Program Chair can't be created: "Program Chairs need migration 080, which isn't applied yet". |
| Review quiz after the graded tries | 083 | Once a student has used their tries, the quiz can't be started again. |
| Skill mastery fitted from real answers | 084 | The review quiz and the Library use default mastery for every skill. System Tests says "No fit stored yet: migration 084 isn't applied." |
| A Program Chair linked to their Dean | 087 | A Dean can't add Program Chairs: "Adding Program Chairs needs migration 087, which isn't applied yet". |
| Long course titles | 088 | A course title over 120 characters is refused with a message naming 088. |
| Storage for retrained ML models | 090 | Retraining on iCARE++ data has nowhere to save its models. Predictions keep using the models shipped with the service. |
| Curriculum page | 091 | The page says "The curriculum needs database migration 091 applied first." Assign Course keeps its built-in list. |
| Students' permission to use AI | 092 | No student has said yes, so AI study tips, AI feedback and AI summaries of a student stay off, and the app never asks. |
| Case Presentations by group | 093 | "Case presentations by group are not set up yet (migration 093 has not been applied)." |
| Forms on a Return Demonstration | 094 | "Forms on a Return Demonstration need database migration 094." |
| Forms an Instructor uploads for a Return Demonstration | 095 | "Uploading your own forms needs database migration 095." |
| One warehouse refresh at a time, and the 5-minute schedule | 096 | Several servers can refresh the analytics data at once, and under load a refresh can fail and leave it stale. |
| Essay questions in Quizzes | 097 | Essay questions can't be saved or answered. The app doesn't say which migration is missing. |

### Storage buckets

The migrations create every bucket the app uses. All are private: files are read and written
only through the API with the service role key, so you add no policies.

| Bucket | Migration | Holds | Limit |
|---|---|---|---|
| `avatars` | 002 | Profile pictures | None set |
| `library` | 061 | PDFs and PowerPoints for Library materials | 50 MB per file |
| `support` | 078 | Images attached to Help & Support messages | 4 MB, images only |
| `ml-models` | 090 | Retrained ML models, used only by the ML service | None set |
| `curricula` | 091 | Curriculum PDFs | 20 MB, PDF only |
| `case-presentations` | 093 | Group slides for Case Presentations | 50 MB per file |

The app also creates the `support` bucket itself on the first upload if it is missing.

### Create the first Admin

Nobody can create accounts until there is an Admin, so the first one is made in the database.
In the database the Admin role is `super_admin`. A Dean is `admin`, a Program Chair is `admin`
with `admin_title` set to `program_chair`, an Instructor is `faculty` and a Student is `student`.

> [!IMPORTANT]
> Migration 055 promotes the original team's accounts by their email addresses. On a new
> install, don't run it as it stands. Replace its list of addresses with your own, or skip it
> and run the statement below.

To create the first Admin:

1. Make sure migration 054 is applied.
2. In the SQL editor, run this, with the first Admin's address in lower case in place of
   `admin@example.com`:

   ```sql
   do $$
   declare
     admin_email text := 'admin@example.com';
   begin
     -- An Admin owns no instructors.
     update public.users set admin_id = null
     where admin_id in (select id from public.users where lower(email) = admin_email);

     -- Promote the account if it exists.
     update public.users set role = 'super_admin'
     where lower(email) = admin_email and role <> 'super_admin';

     -- Otherwise create it, with no password.
     insert into public.users (email, name, role)
     select admin_email, split_part(admin_email, '@', 1), 'super_admin'
     where not exists (select 1 from public.users where lower(email) = admin_email);
   end;
   $$;
   ```

3. Sign in at `https://www.i-care.dev` with Google, using a Google account with that address.
   The first Google sign-in links the Google account to the iCARE++ account with the same
   email. This needs [Google sign-in](#google-sign-in) set up.
4. If you haven't set up Google sign-in, give the account a temporary password instead. It must
   be changed at the first sign-in:

   Replace `<temporary password>`, angle brackets included, with a long random password, for
   example the output of `openssl rand -base64 18`:

   ```sql
   update public.users
   set password_hash = crypt('<temporary password>', gen_salt('bf', 10)),
       force_password_change = true
   where lower(email) = 'admin@example.com';
   ```

   If Postgres can't find `crypt`, write `extensions.crypt` and `extensions.gen_salt`: Supabase
   keeps `pgcrypto` in the `extensions` schema.

**Result:** The account opens the Admin portal, labelled "System Administration". From there the
Admin creates every other account; see [Create an account](admin.md#create-an-account).

## Web portal on Vercel

### Import the project

1. In Vercel, select **Add New** > **Project** and import the repository.
2. Set **Root Directory** to `web`. Vercel reads `web/vercel.json`: the Next.js framework,
   `npm install`, `npm run build`, and the `sin1` region.
3. Add the environment variables in [Environment variables](#environment-variables) before the
   first deployment.
4. Add your domain under the project's domain settings. This manual uses
   `https://www.i-care.dev`.

Vercel deploys every push to `main`, including pushes that change only `docs/` or `mobile/`.

### Environment variables

Set these in the Vercel project's settings, under **Environment Variables**. For local work, the
same names go in `web/.env.local`; `web/.env.example` lists them. "Required" means the portal
fails without it. "Optional" means a feature turns off or falls back to a default.

`NEXT_PUBLIC_` variables are built into the pages, so they change only with a new build. All the
others are read on the server.

**Database and sessions**

| Variable | Required | What it does | Where to get it | Also set in |
|---|---|---|---|---|
| `SUPABASE_URL` | Required | The Supabase project's address. | Supabase, **Project Settings** > **API** | Render, `ml/.env` |
| `SUPABASE_SERVICE_ROLE_KEY` | Required | The server's database key. It gets past row-level security. | Supabase, **Project Settings** > **API** | Render, `ml/.env` |
| `SESSION_SECRET` | Required | Signs every sign-in session, web and app. The portal refuses one shorter than 16 characters. | Generate it: `openssl rand -base64 32` | |

**Google sign-in** (see [Google sign-in](#google-sign-in))

| Variable | Required | What it does | Where to get it | Also set in |
|---|---|---|---|---|
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Optional | Shows the Google button on the sign-in page. | Google Cloud, the web OAuth client | |
| `GOOGLE_CLIENT_ID` | Optional | The server checks Google sign-ins against it. Same value as above. Without it Google sign-in fails. | The same client | |
| `GOOGLE_ANDROID_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID` | Optional | Accept Google sign-ins from the app's own OAuth clients. The current app has no Google sign-in, so leave them empty. | | |

**ML service** (see [Connect the ML service to the web portal](#connect-the-ml-service-to-the-web-portal))

| Variable | Required | What it does | Where to get it | Also set in |
|---|---|---|---|---|
| `ML_SERVICE_URL` | Optional | The ML service's address, with no trailing slash. Without it the risk check answers "ML service is not configured" and nothing is re-scored. | Render, the service's page | GitHub secret |
| `ML_SERVICE_SECRET` | Optional | The shared secret sent to the ML service. Needed with `ML_SERVICE_URL`. | Generate it, for example `openssl rand -base64 32` | Render, GitHub secret |

**AI**

| Variable | Required | What it does | Where to get it |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Optional, but the only key for features that use a student's records | Claude, the first provider tried, and the only one that ever receives a student's records. | Anthropic console, API keys |
| `ANTHROPIC_MODEL` | Optional | The Claude model for most calls. Default `claude-haiku-4-5`. | |
| `ANTHROPIC_DOCUMENT_MODEL` | Optional | The Claude model that reads an uploaded curriculum PDF. Default `claude-haiku-5-5`. | |
| `GEMINI_API_KEY` | Optional | Google Gemini, the first fallback. | Google AI Studio |
| `GEMINI_MODEL` | Optional | Default `gemini-2.5-flash`. | |
| `OPENROUTER_API_KEY` | Optional | OpenRouter's free models, the last fallback. The list of models is in `web/app/lib/ai/openrouter.ts`. | OpenRouter, keys |
| `OPENROUTER_HTTP_REFERER` | Optional | The site address sent to OpenRouter with each call. Defaults to `http://localhost:3000`, so set it to `https://www.i-care.dev`. | |

> [!IMPORTANT]
> A student's records reach an AI only after that student allows it (see
> [Answer the AI question](setup-1-getting-started.md#answer-the-ai-question)), and only
> Anthropic's Claude receives them. The Gemini and OpenRouter fallbacks never receive student
> records. So without `ANTHROPIC_API_KEY`, the AI Summary of a student, study tips and feedback
> on reflections stop working, while the other AI features fall back to Gemini or OpenRouter.

Every AI call also counts against a limit in the app: 20 calls per person per hour and 200 for
the whole app per day. Testing AI features spends the same budget the users have.

**Email** (see [Email](#email))

| Variable | Required | What it does |
|---|---|---|
| `RESEND_API_KEY` | One email option is required | Sends through Resend. When it is set, Resend is used. |
| `RESEND_FROM_EMAIL` | With Resend | The sender address. It must be at a domain verified in Resend. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM_EMAIL` | With SMTP, all five | Sends through an SMTP server when Resend isn't set. |
| `SMTP_SECURE` | Optional | `true` for a server that uses TLS from the start (usually port 465). Otherwise leave it unset. |
| `SMTP_FROM_NAME` | Optional | The sender name for SMTP. Default "iCARE++". |
| `MAIL_FROM_NAME` | Optional | The sender name for either provider. Default "iCARE++". |
| `MAIL_SEND_IN_DEV` | Development only | In `next dev`, email is logged and skipped unless this is `true`. `SMTP_SEND_IN_DEV` is an older name for it. |

Without any email option, new accounts are still created, but the temporary password is shown
once on screen instead of being emailed.

**Addresses and links**

| Variable | Required | What it does |
|---|---|---|
| `MOBILE_APP_URL` | Optional | The Android APK's address, `https` only. `www.i-care.dev/download` redirects to it. Without it, `/download` says "The app isn't available yet" and the buttons that send the app link are off. See [Change the app download link](#change-the-app-download-link). |
| `DEV_TEAM_EMAILS` | Optional, but set it | Where account requests from **Contact us** on the sign-up page go, separated by commas. It defaults to the original developers' inboxes. |
| `CONTACT_EMAIL` | Optional | The address people see and reply to on request receipts and declines. Defaults to the project's contact address. |
| `DEVELOPER_EMAILS` | Leave it empty in production | Addresses allowed into the hidden developer console at `/developer`, which skips every check the app makes. Empty means `/developer` shows a 404 page to everyone. |

**Monitoring and tuning**

| Variable | Required | What it does |
|---|---|---|
| `SENTRY_AUTH_TOKEN` | Optional, build time only | Lets the build upload source maps to Sentry. Without it, errors are still reported, with less readable stack traces. Locally the Sentry plugin reads it from `web/.env.sentry-build-plugin`. |
| `NOTIFICATIONS_STREAM_TTL_MS` | Optional | How long one live-notifications connection stays open before the client reconnects. Defaults to 50 seconds on Vercel and 9 minutes elsewhere. |

The Sentry organisation and project are set in `web/next.config.ts`, and the address errors go
to is in `web/sentry.server.config.ts`, `web/sentry.edge.config.ts` and
`web/instrumentation-client.ts`. To report to your own Sentry project, change them there.

**Don't set these.** Vercel sets `VERCEL`, `VERCEL_GIT_COMMIT_SHA` and `VERCEL_DEPLOYMENT_ID`
itself. `web/next.config.ts` sets `ICARE_BUILD_ID`. `NEXT_DIST_DIR` and `CHECK_SH_BUILD` are for
`./check.sh`. The seed scripts in `web/scripts/` read a few `SEED_` names, for test data only.

**Names you may see that the code doesn't read.** `SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SUPABASE_URL`
and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are read only by a browser helper that nothing calls.
`OPENROUTER_MODEL` is in `web/.env.example`, but the code uses its own list of free models. You
don't need to set any of them.

### Email

iCARE++ sends welcome emails, sign-in and reset codes, announcements and support replies. Use
Resend or an SMTP server. When `RESEND_API_KEY` is set, Resend wins.

To send through Resend:

1. In Resend, add your domain and add the DNS records it shows. Wait until Resend shows the
   domain as verified.
2. Create an API key.
3. In Vercel, set `RESEND_API_KEY`, and set `RESEND_FROM_EMAIL` to an address at the verified
   domain, such as `noreply@` followed by the domain.
4. Redeploy (see [Deploy and check](#deploy-and-check)).
5. Send a test. In `web/`, with the same values in `web/.env.local`, run the command below with
   an address outside your Resend account. That is the case that fails when the domain isn't
   verified.

   ```sh
   npx tsx scripts/test-email.ts someone@example.com
   ```

> [!IMPORTANT]
> Until the domain is verified, Resend delivers only to the Resend account's own address and
> refuses everything else with a 403, so invitations to anyone else fail. A `gmail.com` sender
> can never be verified: the domain must be one whose DNS you control.

To send through SMTP instead, leave `RESEND_API_KEY` unset and set the five `SMTP_` variables
in the table above. With Gmail, the host is `smtp.gmail.com`, the port is 587, `SMTP_SECURE` is
left unset, and `SMTP_PASS` is an App Password from the Google account, not its normal password.

### Google sign-in

Google sign-in is for the web portal only. The mobile app signs in with email and password.

To set up Google sign-in:

1. In the Google Cloud console, go to **APIs & Services** > **Credentials**.
2. Create an OAuth client ID of type **Web application**. Set up the OAuth consent screen first
   if Google asks.
3. Under **Authorized JavaScript origins**, add `https://www.i-care.dev`. For local work, add
   `http://localhost:3000` as well.
4. Copy the client ID into both `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_ID` in Vercel.
5. Redeploy. The public ID is built into the sign-in page, so it takes effect only with a new
   build.

**Result:** The sign-in page shows Google's button. Google sign-in opens only accounts that
already exist. The first Google sign-in links the Google account to the iCARE++ account with the
same email. Anyone else sees "No iCARE++ account uses this Google account yet. Request one
through the contact form." Users can link or unlink Google later; see
[Connect or disconnect Google](common-tasks.md#connect-or-disconnect-google).

### Deploy and check

A change to an environment variable reaches users only after a new deployment. Pushing to `main`
deploys. To apply a variable change without a push, open the latest deployment in Vercel and
redeploy it.

Open portal tabs offer a refresh only when the deployment changed code in `web/`. A redeploy of
the same code, such as one for a variable change, prompts nobody.

To check a deployment:

1. Open `https://www.i-care.dev` and sign in as an Admin.
2. On the Admin portal's **Dashboard**, select **Check System Health Status**.

**Result:** The portal checks the **Database**, the **Data warehouse**, the **ML prediction
service**, each AI provider, **Email delivery** and **Sign-in sessions**. A check that fails
names what is missing, for example "ML_SERVICE_URL is not set". See
[System health checks](admin.md#system-health-checks).

## ML service on Render

### Create the service from the Blueprint

`render.yaml` at the repository root is a Render Blueprint for the `ml/` service. It describes a
Docker web service called `icare-ml` on the free plan, in the `singapore` region, built from
`ml/Dockerfile`, with the health check at `/health` and automatic deploys turned off.

To create the service:

1. In Render, select **New** > **Blueprint** and choose the repository.
2. Render asks for `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `ML_SERVICE_SECRET`. Enter the
   same values the web portal uses. They are stored in Render and never in git.
3. Apply the Blueprint. Render builds the image and starts the service.

**Result:** On its first start, the service stores the Low performing models that ship with it
(trained on the public OULAD data set) as the active models, so predictions work before iCARE++
has data of its own.

The free plan puts the service to sleep after about 15 minutes without requests. The first
request after that can take up to a minute.

### ML service variables

| Variable | Required | What it does | Default |
|---|---|---|---|
| `SUPABASE_URL` | Required | The Supabase project's address. The service stops at start without it. | |
| `SUPABASE_SERVICE_ROLE_KEY` | Required | The database key. | |
| `ML_SERVICE_SECRET` | Required | Must equal the web portal's `ML_SERVICE_SECRET`. The service refuses to start with an empty one, and answers 401 to a request without it. | |
| `ML_SCHEDULE_ENABLED` | Optional | Runs the nightly jobs inside the service. The Blueprint sets `false`, because a sleeping free service runs nothing. | `true` |
| `ML_SCHEDULE_TIME` | Optional | When the in-service schedule runs, as 24-hour HH:MM on the service's clock. | 03:00 |
| `ML_RISK_THRESHOLD` | Optional | The probability at or above which a student is Low performing. | 0.5 |
| `ML_PRIMARY_MODEL_KIND` | Optional | Which shipped model writes predictions: `random_forest` or `logistic_regression`. A model retrained on iCARE++ data always comes first. | `random_forest` |
| `ML_AUTO_SWITCH` | Optional | `true` switches to a retrained model on its own when it passes the test in `ml/training/train_icare.py`. `false` keeps new models waiting for a person. | `true` |
| `SUPABASE_REST_URL`, `SUPABASE_STORAGE_URL` | Optional | Override the REST and Storage addresses, for a self-hosted database. | Built from `SUPABASE_URL` |

`ML_RECOMMEND_K` is in `render.yaml` and `ml/.env.example`, but nothing reads it since the quiz
recommender was removed. You can leave it as it is.

### Connect the ML service to the web portal

1. In Render, copy the service's address from its page.
2. In Vercel, set `ML_SERVICE_URL` to that address, with no trailing slash, and
   `ML_SERVICE_SECRET` to the same secret Render holds.
3. In GitHub, add the same two values as repository secrets for the nightly run (see
   [The nightly run](#the-nightly-run)).
4. Redeploy the web portal.
5. Run the system health check (see [Deploy and check](#deploy-and-check)). **ML prediction
   service** should pass.

**Result:** Deans and Program Chairs can run the risk check by hand (see
[Run the risk check](dean.md#run-the-risk-check)), and so can Instructors (see
[Score students for risk](instructor.md#score-students-for-risk)). The web portal also re-scores
a student in the background when they hand in graded work and when an Instructor finalizes a
grade.

### The nightly run

`.github/workflows/ml-nightly.yml` runs every day at 19:00 UTC, which is 03:00 in the
Philippines. It wakes the service, scores every student, refits the skill mastery estimates that
the review quiz and the Library use, and retrains the models on iCARE++ data once there is
enough graded work. You can also start it by hand from the repository's **Actions** tab.

It needs the repository secrets `ML_SERVICE_URL` and `ML_SERVICE_SECRET`.

> [!IMPORTANT]
> Never run the workflow and the service's own scheduler together, or every job runs twice. Keep
> `ML_SCHEDULE_ENABLED` set to `false` while the workflow is on. If you move to a paid Render
> instance that doesn't sleep, you may set it to `true`, but then disable the workflow.

### Deploy a new ML version

Automatic deploys are off, so a push to `main` never redeploys the ML service by itself.

To deploy a new version:

1. Run `./check.sh ml` and fix anything it reports. It compiles the Python sources and checks
   that everything the Dockerfile copies reaches the build.
2. Push the change to `main`.
3. In Render, open the `icare-ml` service and start a manual deploy of the latest commit.
4. When it is live, run the system health check.

## Mobile app with Expo EAS

### Accounts and tools

1. Install eas-cli 21 or later, and sign in with `eas login`. Your Expo account needs access to
   the project that `mobile/app.json` names.
2. In `mobile/`, run `npm ci`. Run it again every time you pull dependency changes. A
   `node_modules` that doesn't match `package-lock.json` gives an update the wrong runtime
   version.

### Build profiles and app settings

`mobile/eas.json` has three build profiles:

| Profile | Channel | Builds | Notes |
|---|---|---|---|
| `development` | `development` | A development client, for your own testing | No `env` block: it uses your local settings. |
| `preview` | `preview` | An APK for internal testing | Has the `env` block. |
| `production` | `production` | The APK students install | Has the `env` block. The Android version code goes up by itself on every build. |

The `env` block holds the app's `EXPO_PUBLIC_` values:

| Variable | Required | What it does |
|---|---|---|
| `EXPO_PUBLIC_API_URL` | Required | The web portal the app calls, `https://www.i-care.dev`. Without it the app calls the Android emulator's default address and loads nothing. |
| `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` | Not read | Left from the app's Google sign-in, removed in October 2026. They stay because editing `eas.json` changes the fingerprint. |

> [!IMPORTANT]
> Every `EXPO_PUBLIC_` value the app needs must be in the `env` block of both `preview` and
> `production` in `eas.json`. EAS never sees `mobile/.env.local`, and a missing value fails
> silently: the app is built without it.

`ICARE_STUDENT_WEB` is set only by the student web app's publish script, and Expo sets
`EXPO_BASE_URL` itself. Don't set either.

The app's own settings are in `mobile/app.json`: the name "iCARE++", the Android package
`dev.icare.mobile`, and `runtimeVersion` with the `fingerprint` policy, which decides which
installed APKs an update can reach. `mobile/app.config.ts` changes nothing except when the
student web app is built.

The `submit` block in `eas.json` is set up for Google Play's internal track, but the app isn't
on Google Play. Students install the APK from the download link.

### Build a new Android app

Build a new APK when a change can't go out as an update (see
[When an update needs a new Android app](#when-an-update-needs-a-new-android-app)).

To build a new APK:

1. Commit everything in `mobile/`.
2. In `mobile/`, run `npm ci`.
3. Run:

   ```sh
   eas build --platform android --profile production
   ```

   A plain `eas build` reads the `env` block in `eas.json`, so it needs no wrapper.

4. When the build finishes, copy the APK's address from the build's page on expo.dev.
5. In Vercel, set `MOBILE_APP_URL` to that address and redeploy (see
   [Change the app download link](#change-the-app-download-link)).

**Result:** `www.i-care.dev/download` now serves the new APK. Students install it the usual way
(see [Install the iCARE++ app](setup-1-getting-started.md#install-the-icare-app)), and Deans can
email them the link (see [Email the app link to students](dean.md#email-the-app-link-to-students)).

**What happens next:** Updates published from now on reach this APK. Students who keep an older
APK keep their old version until they install the new one.

### Publish an over-the-air update

An over-the-air update sends new JavaScript and images to the APKs students already have. Users
see an "Update ready" alert with **Later** and **Restart** (see
[Keep the app up to date](setup-1-getting-started.md#keep-the-app-up-to-date)).

To publish an update:

1. Commit everything in `mobile/`. The script refuses to run with uncommitted changes, so what
   ships is exactly what is committed.
2. In `mobile/`, run `npm ci` if dependencies changed since your last install. The script
   refuses to run when `node_modules` doesn't match `package-lock.json`.
3. Run, with a short description of the update:

   ```sh
   npm run publish-update -- "Fix the quiz timer"
   ```

   Add `--profile preview` to publish to the preview channel instead of production.

**Result:** The update goes to the profile's channel, with that profile's `env` values from
`eas.json`. It reaches only APKs whose runtime matches the code you published.

> [!IMPORTANT]
> Publish only with `npm run publish-update`, never a bare `eas update`. `eas update` doesn't
> read the `env` block of `eas.json`, so the bundle ships without `EXPO_PUBLIC_API_URL` and every
> phone calls an emulator-only address. Run without `--environment`, it bundles your local
> `.env.local` values instead.

### When an update needs a new Android app

The runtime version is a fingerprint of the app's native side. When it changes, an update no
longer reaches the APKs students have, so you need a new APK first. These changes need one:

- Adding, removing or upgrading a package with native code, including an Expo SDK upgrade.
- Editing `mobile/app.json` or `mobile/eas.json`.
- Editing the `scripts` in `mobile/package.json`. That is why the student web app's publish
  script isn't an npm script.
- Adding or changing a config plugin.

Changes to screens, styles and other JavaScript go out as an update.

Always run `npm ci` before you publish. The fingerprint is read from `node_modules`. On
2026-10-30 an update was published after the SDK 58 upgrade without `npm ci`: it got the old
APKs' runtime version, and its new code crashed those APKs on every tab switch.

### iPhone builds

There is no iPhone version yet; no iPhone build has succeeded. The first build must be run
interactively (`eas build --platform ios`, without `--non-interactive`) with a paid Apple
Developer account, so EAS can set up the signing credentials. `mobile/app.json` already has the
bundle identifier `dev.icare.mobile`, and `docs/app-store-review-notes.md` holds the notes for
App Store review.

### The student web app

The student web app is the same app built for browsers and served by the web portal at
`/student`. The panel has approved students using it. It is a second way in, not the main one:
it stays off until an Admin turns it on, and it is not the iPhone version.

To publish a new version of it:

1. Commit everything in `mobile/`. The script refuses to run with uncommitted changes.
   `--allow-dirty` is only for trying them locally.
2. In `mobile/`, run:

   ```sh
   node scripts/publish-web.mjs
   ```

   It builds the app for browsers under `/student` and replaces `web/public/student`.
3. From the repository root, run `./check.sh web`, then commit `web/public/student` by path and
   push.

**Result:** The portal's next deployment serves the new files at `/student`. Unlike an update,
it reaches every student at once. Open tabs offer a reload when a newer version is live.

To switch it on, an Admin uses **Student Web App** in the Admin portal (see [Turn the student web app on or off](admin.md#turn-the-student-web-app-on-or-off)).
The change takes effect within about 15 seconds and needs no migration. While it is on:

- Students sign in at `https://www.i-care.dev/student` with their usual account. Staff are
  refused there.
- While it is on, `/download` redirects iPhones to `/student` (`web/app/download/route.ts`). This
  is a stopgap, not an iPhone version.
- Browsers get no push notifications, so each notification is also emailed to students who used
  the web app in the last 7 days, unless they turned off email notifications.

Turning it off signs out students who are using it at their next tap. Their work is kept, and the
Android app isn't affected. To remove the files as well, delete `web/public/student` and deploy.
More detail is in `docs/student-web-app.md`.

## GitHub Actions

| Workflow | Runs | What it does | Secrets |
|---|---|---|---|
| CI (`ci.yml`) | Every push to `main` and every pull request | `web/`: generates types, type-checks, lints (warnings only) and builds with dummy values. `mobile/`: type-checks and lints (warnings only). | None |
| ML nightly (`ml-nightly.yml`) | Every day at 19:00 UTC, or by hand | See [The nightly run](#the-nightly-run). | `ML_SERVICE_URL`, `ML_SERVICE_SECRET` |
| Tests (`tests.yml`) | By hand only, with the address of a deployment | Runs the API suite (Postman), then the browser suite (Playwright), against that deployment. It can send the results to the Admin portal's **System Tests**. | `TEST_SUPER_ADMIN_EMAIL`, `TEST_SUPER_ADMIN_PASSWORD`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`, `TEST_FACULTY_EMAIL`, `TEST_FACULTY_PASSWORD`, `TEST_STUDENT_EMAIL`, `TEST_STUDENT_PASSWORD` |

Add secrets in the repository's **Settings** > **Secrets and variables** > **Actions**.

The test account names use the database's role names: `SUPER_ADMIN` is an Admin, `ADMIN` a Dean
and `FACULTY` an Instructor. Use accounts made for testing, whose passwords are already set. The
suites create, edit and delete no app data, but each sign-in signs out any other web session of
that account, so don't use a test account by hand while a suite runs. `web/tests/README.md`
explains the suites. It also covers the load tests: Apache JMeter plans in `web/tests/load/`,
run with `npm run test:load:live` and a `JMETER_HOME` variable that points at your JMeter
install. They send read-only requests as the test accounts, and the larger steps slow the live
site, so run them when few people are using it.

CI doesn't compile the ML service; `./check.sh` does.

## Local development

### Environment files

Every environment file is ignored by git, and `./check.sh` fails if one is ever tracked. Copy
each from its example and fill it in:

| File | Copy from | Read by |
|---|---|---|
| `web/.env.local` | `web/.env.example` | `next dev`, and the scripts in `web/scripts/` |
| `web/.env.test` | `web/.env.test.example` | The test suites only |
| `ml/.env` | `ml/.env.example` | The ML service, through `./start.sh` |
| `mobile/.env.local` | `mobile/.env.example` | `expo start` and local development builds only, never EAS |

Notes for local work:

- To use a local ML service, set `ML_SERVICE_URL` in `web/.env.local` to
  `http://127.0.0.1:8000`, with the same `ML_SERVICE_SECRET` in both files.
- `ml/.env.example` turns the service's own scheduler on. Turn it off (`ML_SCHEDULE_ENABLED` set
  to `false`) when `ml/.env` points at the production database, or the nightly jobs run twice.
- In `mobile/.env.local`, leave `EXPO_PUBLIC_API_URL` unset to reach your own machine from the
  Android emulator. On a physical phone, set it to your machine's address on the local network,
  such as `http://192.168.1.10:3000`.
- In development, email is logged and skipped unless `MAIL_SEND_IN_DEV` is `true`.

### Start the stack

Install each app once:

```sh
(cd web && npm ci)
(cd mobile && npm ci)
(cd ml && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt)
```

Then, from the repository root:

```sh
./start.sh
```

**Result:** The web portal runs at `http://localhost:3000`, the ML service at
`http://localhost:8000`, and Expo's Metro bundler starts for the app. Each log line is tagged
with the app it came from. Press **Ctrl+C** once to stop all three.

- `./start.sh web ml` starts only the apps you name.
- `EXPO_CLEAR=1 ./start.sh` clears Expo's cache as it starts.
- `start.sh` stops at once and says what to run if `node_modules`, `ml/.venv` or `ml/.env` is
  missing.

To build the web portal while `next dev` is running, build into another folder:
`NEXT_DIST_DIR=.next-build npm run build`. A build into `.next` breaks the running dev server.

### Check before every commit

Run `./check.sh` from the repository root before every commit, and commit only when it ends with
"All blocking checks passed". Run only the part the commit needs:

| The commit touches | Run | Takes |
|---|---|---|
| Code, config or package files in `web/`, `mobile/` or `ml/` | `./check.sh` with those apps, such as `./check.sh web` | a few minutes, so start it in the background |
| `check.sh` or `.github/workflows/` | `./check.sh` | a few minutes |
| Only docs, Markdown, `.claude/`, diagrams or SQL migrations | `./check.sh security` | seconds |

The app checks run what CI runs, plus the ML compile and `npm audit`. Every run, `security`
included, does a secret scan of the files you changed and checks for duplicate migration
numbers.

- **Blocking:** tracked secrets, the secret scan, migration numbers, the `web/` type generation,
  type check and build, the `mobile/` type check, and the ML compile and Docker check. Fix these
  before you commit.
- **Warnings:** lint and `npm audit`. Read them. Fix lint errors in code you touched. The mobile
  audit warning is expected for now: what is left sits inside Expo's own tooling.

`./check.sh --quick` skips the build and the audit.

When `./check.sh` fails for a reason that isn't the code, such as a tool change, fix
`check.sh` in the same change. Regenerate `web/package-lock.json` with `npx -y npm@11 install`.
Commit by path (`git commit <paths>`), because several people may share one working copy.

## Routine operations

### Rotate a secret

Change a secret everywhere it is set, then redeploy each host that uses it.

| Secret | Set in | After the change |
|---|---|---|
| `SESSION_SECRET` | Vercel, `web/.env.local` | Redeploy. Everyone is signed out, on the web and in the app. |
| `SUPABASE_SERVICE_ROLE_KEY` | Vercel, Render, `web/.env.local`, `ml/.env` | Redeploy the web portal and the ML service. |
| `ML_SERVICE_SECRET` | Vercel, Render, GitHub secret, `web/.env.local`, `ml/.env` | Change all of them together. While they differ, the ML service answers 401 and risk checks fail. |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY` | Vercel | Redeploy, then run the health check. |
| `RESEND_API_KEY` or `SMTP_PASS` | Vercel | Redeploy, then send a test email. |
| `SENTRY_AUTH_TOKEN` | Vercel, `web/.env.sentry-build-plugin` | Takes effect at the next build. |
| `TEST_` passwords | GitHub secrets, `web/.env.test` | Nothing else. |

> [!IMPORTANT]
> If a secret was ever committed, rotate it even after you delete it. It stays in the git
> history of a public repository.

### Change the app download link

Everything handed out, from welcome emails to the portals' buttons, links to
`www.i-care.dev/download`, which redirects to `MOBILE_APP_URL`. Change that variable after every
new APK.

To change the link:

1. In Vercel, set `MOBILE_APP_URL` to the new APK's address. It must start with `https://`.
2. Redeploy.

**Result:** `/download` serves the new APK. Links in emails already sent keep working, because
they point at `/download`, not at the APK.

### Check system health

On the Admin portal's **Dashboard**, select **Check System Health Status**. The same button is on
**System Tests**. Each result is saved there, so you can compare runs. See
[System health checks](admin.md#system-health-checks).

The Dashboard's overall status takes the worst of three things: the latest health check, the
share of requests that succeeded, and the 95th-percentile response time. So it can be red while
every check passes, when requests fail or are slow. Open **System Performance** to see which
requests.

### Retake the manual screenshots

After a change to the screens, retake the manual's screenshots with the scripts in
[`tools/web/`](tools/web/) for the web portal, which use demo mode, and
[`tools/phone/`](tools/phone/) for the phone screens, which use a browser build of the app with
made-up data. Neither needs an account or writes to the database.

Then rebuild the printable copy, `iCARE-User-Manual.docx`, with the scripts in
[`tools/docx/`](tools/docx/). It is made from these guides, so change the guides, not the
.docx.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| The risk check says "ML service is not configured". | `ML_SERVICE_URL` or `ML_SERVICE_SECRET` is unset on Vercel. | Set both and redeploy. |
| The first ML run in a while is slow or fails. | Render's free plan put the service to sleep. | Wait a minute and run it again. |
| ML runs fail with 401. | `ML_SERVICE_SECRET` differs between Vercel, Render and GitHub. | Make all three the same. |
| Two sets of nightly notifications arrive. | The service's own scheduler and the nightly workflow both ran. | Set `ML_SCHEDULE_ENABLED` to `false`, or disable the workflow. |
| The app stops loading after an update. | The update was published with a bare `eas update`, so it has no API address. | Republish with `npm run publish-update`. |
| `publish-update` stops with "mobile/ has uncommitted changes". | Uncommitted files would ship in the update. | Commit them first. |
| `publish-update` stops with "node_modules doesn't match package-lock.json". | Dependencies changed without an install. | Run `npm ci` in `mobile/`. |
| Some phones never get an update. | Their APK has an older runtime. | They install the new APK from `www.i-care.dev/download`. |
| `/download` says "The app isn't available yet". | `MOBILE_APP_URL` is unset or doesn't start with `https://`. | Set it and redeploy. |
| Invitation emails are refused with 403. | The Resend domain isn't verified. | Verify the domain, and send from an address at it. |
| No emails arrive in development. | Development skips sending. | Set `MAIL_SEND_IN_DEV` to `true`. |
| The Google button is missing, or Google sign-in fails on the web portal. | `NEXT_PUBLIC_GOOGLE_CLIENT_ID` or `GOOGLE_CLIENT_ID` is unset, or the site isn't an authorized JavaScript origin. | Set both, add the origin in Google Cloud, and redeploy. |
| Google sign-in says "No iCARE++ account uses this Google account yet." | No account has that email. | Create the account first, with the same email. |
| The Admin Dashboard's status is red while every health check passes. | The 95th-percentile response time is slow, or too many requests failed. | Open **System Performance**. |
| A page says "Migration NNN isn't applied yet", or that something needs a migration. | That migration isn't in the database. | Apply it (see [Apply the database schema and migrations](#apply-the-database-schema-and-migrations)). |
| The Skills lists are empty. | The Skills catalog wasn't loaded. | Run `npx tsx scripts/seed-taylor-skills.ts` in `web/`. |
| A variable change has no effect. | Vercel applies variables to new deployments only. | Redeploy. |
| `/developer` shows a 404 page. | `DEVELOPER_EMAILS` is empty. | Nothing: that is how production should be. |
