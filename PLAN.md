# iCARE++ Master Development Plan

**System:** iCARE++ — A Scalable Machine Learning-Driven Clinical Competency Assessment and Adaptive Learning System for Nursing Students
**Institution:** College of Health Sciences, Batangas State University – TNEU ARASOF Nasugbu
**Reference:** `docs/FULL MANUSCRIPT.pdf` (Chapters I–III)
**Repos:** `web/` (Next.js 16 + Supabase), `mobile/` (Expo 54 / React Native 0.81)
**Plan date:** 2026-07-06

---

## 1. Where the project stands today

### 1.1 web (further along)

**Working now:**
- Custom auth: email/password (bcrypt) + Google OAuth, JWT sessions via `jose`, OTP-based forgot-password over email (`app/lib/auth/*`, `app/api/auth/*`)
- Role-aware portals: `/admin` (Dean), `/faculty`, `/(student)` route group
- Patients backed by real **MIMIC-IV demo data** (`data/mimic-iv-demo/`, seed scripts, `patients` table with vitals/labs JSONB)
- Scenario system: AI-generated scenarios via **OpenRouter** (`app/lib/ai/openrouter.ts`), faculty CRUD, assignment to students, student completion flow
- Faculty–student roster (`faculty_students`), avatar storage, profile management
- Supabase schema + 6 migrations: `users`, `password_resets`, `patients`, `faculty_students`, `scenarios`, `scenario_assignments`

**Gaps vs manuscript:**
- **No quiz/assessment tables at all** — `app/quizzes/page.tsx` and `app/performance/page.tsx` are legacy mock pages still using `localStorage` auth
- No ML performance prediction, no recommendation engine, no Python component
- No rooms, no audit trail, no notifications, no competency model, no star-schema warehouse
- Admin analytics/reports pages render hard-coded mock numbers
- No PWA/offline capability, no PDF report generation
- Role enum is `student|faculty|admin` — no distinct Dean/super-admin tier and RLS policies are thin (most access decided in API routes with the service key)
- Not a git repository (blocks ultraplan/cloud tooling, CI, and safe collaboration)

### 1.2 mobile (UI shell only)

- Expo Router screens exist for every manuscript-required student feature: dashboard, vitals (+ per-patient detail), tasks, quizzes (+ take-quiz), EHR (+ TPR/IVF sheets), progress, recommendations, notifications, profile, login
- **Everything is mock data** — `lib/api.ts` is typed interfaces + in-memory fixtures; zero network calls, no auth, no persistence, no offline sync, no push notifications
- Also not a git repository

### 1.3 What the manuscript commits the system to (the contract)

From Objectives (pp. 15–17), Scope (pp. 20–23), Architecture/DFD/ERD (pp. 74–82), and Instrumentation (pp. 89–98):

| # | Feature | Manuscript detail |
|---|---------|-------------------|
| F1 | ML student performance prediction | Random Forest + Logistic Regression classifiers; early at-risk flagging; pre-trained public-dataset baseline models during cold start; evaluated with precision/recall/F1 on a held-out set |
| F2 | Adaptive quiz & learning recommendation engine | Content-based filtering targeting each student's knowledge gaps; evaluated with Precision, Recall, Hit Rate at K vs faculty-verified ground truth |
| F3 | Rule-based vital signs monitoring | Anomaly detection on encoded patient vitals (rule-based clinical thresholds, not ML, per scope) |
| F4 | AI-driven CDSS in simulated EHR | Simulated patient case management + clinical documentation training: TPR sheet, IVF sheet, progress notes |
| F5 | Star-schema data warehouse + analytics dashboard | Consolidates performance records, clinical training logs, competency data; multi-campus-ready repository |
| F6 | Automated competency reports | PDF generation |
| F7 | Audit trail | Comprehensive, unalterable activity logging |
| F8 | Real-time notifications & alerts | Firebase Cloud Messaging; offline queuing of critical alerts |
| F9 | PWA offline-first web app | Feature Availability Rate measured under no-connectivity (Chrome DevTools) |
| F10 | Mobile app (Android 6+/iOS 12+) | Student-facing core: vitals monitoring, adaptive quizzes, clinical task logging; faculty/admin stays web |
| F11 | RBAC (Dean / Faculty / Student) | Postman + Playwright role-access test matrix; Data Privacy Act of 2012 (RA 10173) compliance |
| F12 | Admin operations | User provisioning, room management, faculty management, question bank configuration, cohort analytics, at-risk reports |
| F13 | Performance benchmarks | JMeter: response time, throughput (RPS), scalability (ramp-up degradation %), reliability (error rate %) |

**ERD entities required** (Fig. 9): User/Role/Campus, Student, Faculty, Dean, Patient (+ IVF/TPR records, Notes), Room + Room Assignment, Assistance Request, Assessment + Question Set + Assessment Attempt, Competency Areas, Learning Recommendation, Competency Score, Performance Prediction + ML Model + Performance Metric, Service Feedback.

**DFD processes** (Fig. 8): 1.0 Manage Accounts, 2.0 Manage Rooms, 3.0 Manage Patients, 4.0 Monitor Vital Signs, 5.0 Manage Assessments, 6.0 Generate Reports & Analytics.

---

## 2. Target architecture

```
┌────────────────────┐     ┌─────────────────────┐
│ web (Next.js)│     │ mobile (Expo) │
│ PWA, offline-first │     │ Android / iOS       │
│ Dean+Faculty+Student│    │ Student core flows  │
└─────────┬──────────┘     └──────────┬──────────┘
          │  HTTPS (shared REST API: Next.js route handlers)
          ▼
┌─────────────────────────────────────────────────┐
│ Next.js API layer (auth, RBAC, audit middleware)│
│  ├─ Supabase Postgres (OLTP schema + RLS)       │
│  ├─ Star-schema warehouse (same PG, `dw` schema)│
│  ├─ Supabase Storage (avatars, PDF reports)     │
│  ├─ OpenRouter (CDSS scenario/AI features)      │
│  └─ Firebase Cloud Messaging (push)             │
└─────────┬───────────────────────────────────────┘
          │ internal HTTP
          ▼
┌─────────────────────────────────────────────────┐
│ ml (NEW: Python FastAPI service)          │
│  ├─ Random Forest + Logistic Regression         │
│  ├─ Training pipeline + model registry table    │
│  ├─ Content-based quiz recommender              │
│  └─ Evaluation scripts (precision/recall/F1,    │
│     Hit Rate at K) for the manuscript's Ch. IV  │
└─────────────────────────────────────────────────┘
```

Key decisions (recommended, all reversible):
- **Keep two app repos + add one `ml` repo** (manuscript mandates Python for ML; keep it out of the Next.js deploy). Alternatively fold all three into a single monorepo — decide at Phase 0.
- **Mobile consumes the same Next.js API routes** the web uses (session token via `Authorization: Bearer`), so there is exactly one backend to test with Postman.
- **Warehouse lives in the same Postgres** as a `dw` schema populated by a scheduled ETL (Supabase cron / pg_cron). "Multi-campus ready" = every fact/dim row carries `campus_id`; no second database needed for the capstone.
- **Rule-based vitals anomaly detection runs in TypeScript** on the API layer (it's threshold logic, keeping it out of the ML service preserves offline evaluation on mobile later).

---

## 3. Phased delivery plan

Phases are ordered so each unblocks the next; within a phase, items are roughly parallelizable. Effort markers: **S** (≤1 day), **M** (2–4 days), **L** (≈1 week+).

### Phase 0 — Repo & environment foundation (blocking everything)

| # | Task | Effort |
|---|------|--------|
| 0.1 | ~~`git init`~~ **Done 2026-07-06** — monorepo at `github.com/mdk-zero/icare` with `web/`, `mobile/`, `docs/`; `.idea/` untracked; per-project `.gitignore`s verified | S |
| 0.2 | Environment hygiene: `.env.example` per repo documenting every var (Supabase URL/keys, JWT secret, Google OAuth, SMTP, OpenRouter, FCM); verify no secrets are committed | S |
| 0.3 | CI (GitHub Actions): lint + `tsc --noEmit` + build on both repos; migration dry-run job for web | M |
| 0.4 | Consolidate migrations: current `schema.sql` + 6 numbered migrations drift; adopt Supabase CLI migration workflow as single source of truth | M |
| 0.5 | ~~Decide monorepo vs multi-repo~~ **Decided: monorepo.** The future ML service lives at `ml/`; a shared `types` package (or codegen) can be added when mobile wiring starts | M |

### Phase 1 — Complete the data model (DFD/ERD parity)

**Status 2026-07-07: 1.1–1.10 done** — migrations `007_add_campuses` … `013_add_assistance_and_feedback` written (idempotent, RLS-enabled). 1.11 (RLS hardening) still open: the `using (true)` read policies on `campuses`/`competency_areas`/`question_competencies` should be tightened, and roster-scoped policies are still TODO.

New migrations in `web/supabase/migrations/` (all tables: RLS enabled, `campus_id` where relevant):

| # | Task | Detail | Effort |
|---|------|--------|--------|
| 1.1 | `campuses` + `users.campus_id` | Multi-campus readiness (Obj. 2.4); seed ARASOF-Nasugbu | S |
| 1.2 | Dean tier | Either add `dean` to `user_role` enum or `users.is_super_admin` flag; manuscript treats Dean as super-admin distinct from faculty-admins | S |
| 1.3 | `rooms`, `room_assignments` | DFD 2.0; capacity, status, room-student assignment with shift/date; powers admin Rooms page | M |
| 1.4 | Assessment core: `competency_areas`, `assessments`, `questions`, `assessment_attempts`, `attempt_answers` | Questions tagged with competency areas + difficulty; attempts store per-answer correctness and `time_taken` — this is the ML feature source | L |
| 1.5 | Vitals: `vital_sign_readings` | Student-encoded readings per patient (HR, BP, temp, RR, SpO2), `is_anomaly` + `anomaly_reasons` set server-side | M |
| 1.6 | EHR documentation: `tpr_records`, `ivf_records`, `progress_notes` | Matches mobile screens already built; belongs to patient + author student | M |
| 1.7 | `audit_logs` | Append-only (no UPDATE/DELETE grants); actor, role, action, entity, before/after JSONB, IP, timestamp | M |
| 1.8 | `notifications` + `device_tokens` | In-app feed + FCM token registry | M |
| 1.9 | ML artifacts: `ml_models`, `performance_predictions`, `learning_recommendations`, `competency_scores` | ERD Performance & ML cluster; predictions keep model version for auditability | M |
| 1.10 | `assistance_requests`, `service_feedback` | ERD entities; student help-flag during simulation, post-use feedback (feeds Ch. IV usability evaluation) | S |
| 1.11 | RLS hardening pass | Write policies per role per table; current policies let any authenticated user read all patients/scenarios — tighten to roster/assignment scoping | L |

### Phase 2 — Web: retire mocks, wire real features

**Status 2026-07-07:** 2.1 done (legacy `app/quizzes`/`app/performance` deleted). 2.2/2.3 done (faculty question bank + assign, student quiz flow + attempts). 2.4 done (rule engine `app/lib/vitals/rules.ts`, student Log Vitals modal, `/faculty/vitals` monitor, anomaly → roster-faculty notifications). 2.6 done (rooms CRUD + student assignment with capacity checks at `/admin/rooms`). 2.5 done (`/api/student/ehr` + `/api/faculty/ehr`; student EHR modal — TPR/IVF/notes — on the patients page, faculty EHR Review page with progress-note sign-off that notifies the author). 2.7 done (`/api/faculty/competency-scores` + validation form and history on the faculty student-detail Competencies tab; each validation notifies the student). 2.8 partially done (`app/lib/audit.ts` used by all new mutating routes; admin activity-log UI pending). 2.9 in-app half done (`/api/notifications`, faculty page rewired, student `/notifications` page; FCM push pending). 2.11 done (`@react-pdf/renderer` server-side generation at `/api/faculty/reports/competency/[studentId]`; faculty Reports page de-mocked into a per-student Download PDF list; reports render live from competency_scores, attempts, vitals, and EHR counts — no storage bucket, generated on demand). 2.10 done (migration 015 extends `dw_analytics_summary` with competency_detail + live room_utilization; admin and faculty analytics pages rewritten against `/api/analytics/summary` with honest empty states, admin gets a Refresh Warehouse button hitting `/api/admin/etl`; mock `fetchFacultyAnalytics` deleted).

**Status 2026-07-13:** 2.2 fully done — the `quiz` branch merge added a per-assessment builder page (`/faculty/assessments/[id]`) with question types/points, weighted scoring criteria (migrations 016–018, criteria breakdown shown in student results), and section targeting; on top of that, AI-assisted question generation (`POST .../questions/generate`, Gemini→OpenRouter via shared `app/lib/ai/generate.ts`, drafts reviewed before save) and CSV import (client-side parse to drafts + downloadable template) landed on the builder page. A faculty Audit Trail page also exists (`/faculty/audit`). Remaining in Phase 2: only the FCM push half of 2.9. ⚠️ Compliance watch: the faculty audit page exposes a "clear audit trail" DELETE (`/api/faculty/audit`), which contradicts F7 / 1.7 append-only — remove before the soft launch; `admin/students/[id]` still renders mock risk data (Phase 3 known debt).

| # | Task | Detail | Effort |
|---|------|--------|--------|
| 2.1 | Kill legacy localStorage auth | `app/quizzes/page.tsx`, `app/performance/page.tsx`, remnants in student pages → server session (`app/lib/auth/session.ts`) like the rest of the app | M |
| 2.2 | Question bank management (Dean/Faculty) | CRUD UI + CSV import; competency tagging; AI-assisted question generation via existing OpenRouter integration (faculty reviews before publish) | L |
| 2.3 | Student quiz-taking flow | Assignment-driven and self-serve quizzes; timer; per-question feedback with explanation; attempt persistence | L |
| 2.4 | Vital signs monitoring UI | Student encodes vitals per assigned patient; server applies rule-based thresholds (age-aware normal ranges) and flags anomalies inline; faculty sees flagged readings | L |
| 2.5 | EHR documentation (TPR/IVF/progress notes) on web | Mirror of mobile screens for desktop lab use; faculty review + sign-off state | L |
| 2.6 | Rooms management (admin) | Replace mock Rooms page with real CRUD + occupancy from `room_assignments` | M |
| 2.7 | Faculty grading & validation | DFD "Validate Student Performance": faculty reviews attempt/simulation results, records `competency_scores` | M |
| 2.8 | Audit middleware | One wrapper for all mutating API routes writing `audit_logs`; admin Reports page gets real activity log with filters | M |
| 2.9 | Notifications | In-app notification center (all roles) + FCM web push; triggers: assignment created, deadline near, at-risk flag raised, anomalous vitals, faculty validation done | L |
| 2.10 | Real analytics | Admin + faculty dashboards read from warehouse views (Phase 4) instead of hard-coded arrays | L |
| 2.11 | PDF competency reports | Server-side generation (e.g. `@react-pdf/renderer` or Puppeteer route): per-student competency report, cohort at-risk report; stored in Supabase Storage, linked from Reports page | L |

### Phase 3 — ml: prediction + recommendation service (NEW repo)

**Status 2026-07-07: done** — implemented as `ml/` inside the monorepo rather than a new repo. FastAPI service (3.1) with `X-ICARE-ML-KEY` shared-secret auth, Dockerfile, and a thin PostgREST client (same service-role credentials as web; `SUPABASE_REST_URL` override for self-hosted). Feature pipeline (3.2) builds a shared OULAD-compatible space (avg score, trend, attempts, completion/lateness, engagement, recency) plus iCARE-only extras (time-on-task, weakest-competency accuracy, clinical volume). Baselines (3.3): RF + LogReg trained on OULAD (32,593 registrations; held-out F1 0.9308/0.9230, ROC-AUC 0.9794/0.9741), committed under `ml/models/` and auto-registered as active `ml_models` rows on boot. Retraining (3.4): `training/train_icare.py` labels by mean validated competency score < 75, registers staging artifacts; `POST /models/{id}/promote` flips active. Predictions (3.5): `POST /predict/at-risk` writes `performance_predictions` (feature snapshot + top contributing features); new at-risk transitions notify roster faculty (`at_risk_flag`); nightly in-process scheduler. Recommender (3.6): TF-IDF over question competency tags vs a student weakness profile (answer accuracy + faculty validations, neutral prior for unexplored areas), difficulty-matched, persisted to `learning_recommendations` with human-readable reasons. Eval (3.7): `eval/predict_eval.py` and `eval/recsys_eval.py` emit the Ch. IV Model/Recommendation Accuracy Report tables (recsys needs the soft-launch faculty ground-truth CSV — Phase 8.4). Web surfacing (3.8): `/api/faculty/predictions`, `/api/student/recommendations` (with dismiss), `/api/admin/ml` proxy; real prediction card + header badge on faculty student detail, ML risk badges/filter/stats on the roster, "Recommended for You" rail on the student dashboard, "Run ML Jobs" button on admin analytics. Validated end-to-end on a local Postgres 18 + PostgREST 14 stack. Deploy needs: host `ml/` with Supabase creds; set `ML_SERVICE_URL`/`ML_SERVICE_SECRET` in web env. Known debt: `admin/students/[id]` still renders legacy mock risk data (pre-existing mock page).

| # | Task | Detail | Effort |
|---|------|--------|--------|
| 3.1 | Scaffold FastAPI service | Python 3.10+, scikit-learn/pandas/NumPy (per manuscript Table I); Dockerfile; shared-secret auth from Next.js | M |
| 3.2 | Feature pipeline | Extract per-student features from OLTP: quiz accuracy by competency, score trend, time-on-task, completion/lateness rates, vitals-task accuracy, activity recency | L |
| 3.3 | Baseline models (cold start) | Train RF + LogReg on public education dataset (e.g. OULAD) mapped to our feature space; ship as versioned artifacts — manuscript explicitly promises pre-trained baselines during early deployment | L |
| 3.4 | Training + registry | Retraining job on accumulated iCARE++ data; model rows in `ml_models` with metrics; promotion flow (staging → active) | L |
| 3.5 | Prediction endpoint + schedule | `POST /predict/at-risk` batch-scores a cohort; nightly cron writes `performance_predictions`; at-risk transitions fire notifications (Phase 2.9) | M |
| 3.6 | Content-based recommender | TF-IDF/embedding over question competency tags + difficulty vs student's weak-competency vector; `GET /recommend/{student_id}?k=` returns ranked quiz items → `learning_recommendations` | L |
| 3.7 | Evaluation scripts (manuscript Ch. IV evidence) | `eval/predict_eval.py` (precision/recall/F1 per model, held-out set), `eval/recsys_eval.py` (Precision, Recall, Hit Rate at K vs faculty ground-truth CSV); outputs the exact tables the manuscript's Instrumentation section commits to | M |
| 3.8 | Web surfacing | At-risk badges + probability and top contributing features on student profiles (faculty/admin); "Recommended for you" rail on student dashboard (web + mobile) | M |

### Phase 4 — Star-schema warehouse + analytics

**Status 2026-07-07: done** (migration `014_add_warehouse.sql`). `dw` schema with dim_date/campus/student/faculty/room/competency/assessment and fact_assessment_attempts/vital_readings/clinical_tasks/competency_scores/predictions. `dw.run_etl()` does full idempotent upserts (chosen over watermark increments at capstone volumes); nightly pg_cron job auto-registers when the extension is enabled, plus `POST /api/admin/etl` for on-demand runs. Analytics served by security-definer RPC `public.dw_analytics_summary()` (one jsonb payload instead of separate materialized views) via `GET /api/analytics/summary`. Benchmark harness at `web/supabase/benchmarks/dw_benchmark.sql` (4.4). Validated end-to-end on a local Postgres 18 cluster: schema + all 14 migrations applied, ETL ran twice idempotently, summary returned correct numbers against seeded data. Remaining: wire the dashboards to `/api/analytics/summary` (that is Phase 2.10).

| # | Task | Detail | Effort |
|---|------|--------|--------|
| 4.1 | `dw` schema design | Facts: `fact_assessment_attempts`, `fact_vital_readings`, `fact_clinical_tasks`, `fact_predictions`; Dims: `dim_student`, `dim_faculty`, `dim_campus`, `dim_room`, `dim_competency`, `dim_assessment`, `dim_date` | M |
| 4.2 | ETL | Incremental loads via pg_cron (or Supabase scheduled edge function) from OLTP → `dw`; idempotent upserts | L |
| 4.3 | Analytics API + views | Materialized views for cohort summaries, at-risk trends, room utilization, competency pass rates — the exact charts the admin/faculty dashboards mock today | M |
| 4.4 | Query benchmarks | Representative analytical queries + `EXPLAIN ANALYZE` harness; feeds "Data Warehouse Query Performance" evaluation area (Table III) | S |

### Phase 5 — Mobile: from shell to product

| # | Task | Detail | Effort |
|---|------|--------|--------|
| 5.1 | API client + auth | Replace mock `lib/api.ts` with fetch client against web API; login screen → real session; secure token storage (`expo-secure-store`); session refresh | L |
| 5.2 | Wire existing screens | Vitals (list/detail/encode), Tasks, Quizzes (list/take), EHR (TPR/IVF/notes), Progress, Recommendations, Notifications, Profile — screens exist, swap data source screen-by-screen | L (per-screen M) |
| 5.3 | Offline support | Cache reads (AsyncStorage/SQLite); outbox queue for vitals encodings, quiz answers, task logs with sync + conflict policy (server wins, client re-tags); required by scope's "local storage / low-connectivity" commitment | L |
| 5.4 | Push notifications | FCM via `expo-notifications`; register `device_tokens`; deep-link to relevant screen | M |
| 5.5 | Anomaly UX | Show server anomaly flags on encoded vitals; offline fallback: bundle the same rule thresholds client-side so flagging works with no connection | M |
| 5.6 | Build & distribution | EAS build profiles; Android APK for soft launch (min SDK per manuscript: Android 6+ claim vs Expo 54 realities — document actual minimum, likely Android 7+), iOS via TestFlight if licensing allows | M |

### Phase 6 — PWA offline-first web

| # | Task | Detail | Effort |
|---|------|--------|--------|
| 6.1 | Service worker + manifest | Serwist (or handcrafted SW) with Next.js 16; precache shell, runtime-cache student-facing GETs | L |
| 6.2 | Offline write queue | Same outbox pattern as mobile for quiz answers + vitals encoding; UI state for "pending sync" | L |
| 6.3 | Feature Availability Rate self-check | Scripted offline walkthrough (Playwright with network offline) computing FAR % over the core student features — the manuscript's offline metric, automated | M |

### Phase 7 — RBAC, privacy, security hardening

| # | Task | Detail | Effort |
|---|------|--------|--------|
| 7.1 | Permission matrix | Single source (`lib/auth/permissions.ts`): role × resource × action; enforce in one API middleware; remove per-route ad-hoc checks | M |
| 7.2 | Role-access test suite | Postman collection + Playwright specs asserting each role's allow/deny per endpoint & page — Table III "RBAC Enforcement" evidence | M |
| 7.3 | RA 10173 compliance pack | Data inventory & retention policy, consent notice at signup, privacy policy page, account-deletion/anonymization flow, audit-trail coverage review; admin Settings "Data Privacy" page shows real status, not static text | M |
| 7.4 | Security pass | Rate limits on auth + write endpoints (extend `app/lib/auth/rate-limit.ts`), password policy, session invalidation on password change, security headers in `next.config.ts`, dependency audit | M |

### Phase 8 — Testing, benchmarking, soft launch (manuscript Ch. III instrumentation)

| # | Task | Detail | Effort |
|---|------|--------|--------|
| 8.1 | Functional E2E | Playwright suites per role covering the Use Case Diagram flows (Fig. 6); pass/fail per feature → Functional Test Report | L |
| 8.2 | API tests | Postman/newman collection: every endpoint × role × happy/error paths → API Test Report; run in CI | M |
| 8.3 | JMeter test plans | 4 plans: response time, throughput, ramp-up scalability, sustained reliability; scenarios mirror manuscript (students quizzing + encoding vitals, faculty on analytics, Dean generating reports); results → Performance/Throughput/Scalability/Stability Reports | L |
| 8.4 | ML evaluation run | Execute Phase 3.7 scripts on held-out + faculty ground truth; produce Model Accuracy Report + Recommendation Accuracy Report | M |
| 8.5 | Offline validation | Chrome DevTools manual protocol + automated FAR script (6.3) → Offline Test Report | S |
| 8.6 | Warehouse benchmarks | Phase 4.4 harness under single-user and JMeter concurrent load → DW Performance Report | S |
| 8.7 | Soft launch | One NCM 110 section: seed accounts/rooms/question bank, TLA-aligned activities, monitor, collect `service_feedback` + evaluation instruments (workflow efficiency, data accuracy, usability, competency pre/post per Objective 4) | L |

---

## 4. Suggested sequencing & parallelism

```
Phase 0 ──► Phase 1 ──► Phase 2 (web features)
                   ├──► Phase 3 (ML service)      [parallel with 2]
                   ├──► Phase 4 (warehouse)        [parallel, needs 1.4–1.9]
                   └──► Phase 5 (mobile wiring)    [needs 2.x APIs as they land]
Phase 2+5 ──► Phase 6 (PWA/offline)
All features ──► Phase 7 (hardening) ──► Phase 8 (benchmark + soft launch)
```

A realistic solo/small-team pacing: Phases 0–1 ≈ 2 weeks, Phases 2–5 ≈ 6–8 weeks overlapped, Phases 6–8 ≈ 3–4 weeks. Adjust to your defense timeline; Phase 8 outputs map 1:1 to the manuscript's promised evidence, so they cannot be cut.

---

## 5. Risks & watch items

1. **ML cold start** — real at-risk labels won't exist until after the soft launch. Mitigated by the manuscript's own pre-trained-baseline clause (3.3); be explicit in Ch. IV about which model produced which numbers.
2. **Schema churn** — Phase 1 rewrites the data core while features are being built on it. Lock 1.4 (assessments) and 1.9 (ML tables) early; they have the most downstream consumers.
3. **Legacy mock pages** — `app/quizzes`, `app/performance`, admin analytics mocks look "done" in demos but aren't wired; track them as debt so they don't survive to the soft launch.
4. **Two auth styles in the wild** — localStorage remnants vs server sessions; unify (2.1) before adding mobile bearer-token auth to avoid three styles.
5. **Expo vs manuscript OS floor** — manuscript says Android 6/iOS 12; Expo SDK 54 requires higher. Verify and either footnote the correction in the manuscript or pin an achievable floor.
6. **RLS vs service-role bypass** — today almost everything runs through the service key, so RLS is mostly decorative; the RBAC test suite (7.2) is what actually proves the security claims — invest there.
7. **No git history yet** — until 0.1 lands, every change is unrecoverable and no cloud/CI tooling works. Do Phase 0.1 first, today.

---

## 6. Definition of done (maps to Objectives 2–4)

- [ ] All ERD entities exist as migrated, RLS-protected tables (Obj. 2, Fig. 9)
- [ ] RF + LogReg predictions visible in-app with model version + metrics recorded (Obj. 2.1)
- [ ] Adaptive recommendations served to students; Hit Rate at K measured (Obj. 2.2)
- [ ] CDSS-EHR simulation (TPR/IVF/notes + AI scenario support) usable end-to-end on web and mobile (Obj. 2.3)
- [ ] Star-schema warehouse populated by scheduled ETL; dashboards read from it (Obj. 2.4)
- [ ] JMeter reports for response time, throughput, scalability, reliability (Obj. 3)
- [ ] Playwright/Postman/offline/RBAC test reports generated (Instrumentation, Table III)
- [ ] Soft launch completed with one section; evaluation instruments collected (Obj. 4)
