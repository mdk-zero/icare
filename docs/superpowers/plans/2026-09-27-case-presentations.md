# Hospital Case Presentations — Implementation Plan

Spec: `docs/superpowers/specs/2026-09-27-case-presentations-design.md` (approved 2026-09-27).
Baseline: tag `v1.0-ehr-charting`, DB backup `db-backups/2026-09-27-pre-case-presentations`.

Conventions for every task:
- Work on `main`. Commit after each **phase**, once typecheck and build are green; don't push.
  No Claude attribution trailer.
- Web typecheck is `cd web && npx tsc --noEmit`. Web build is
  `NEXT_DIST_DIR=.next-build npm run build` whenever `next dev` is running.
- Mobile typecheck is `cd mobile && npx tsc --noEmit`.
- Stage only this plan's files: `TODO.md` and other people's work-in-progress stay unstaged.
- There is no unit-test framework. Pure logic is checked with a `tsx` script, like the existing
  `scripts/check-assessment-selection.ts`. API behaviour is checked with curl against `next dev`.
  Postman and Playwright stay read-only, as `tests/README.md` requires.

---

## Phase 1 — Migrations 056 and 057

### Task 1.1 — `web/supabase/migrations/056_case_presentations.sql`
Follow the header-comment style of 037 (explain *why* in the comment block).

```sql
create type public.case_submission_status as enum ('not_started','draft','submitted','graded');

create table if not exists public.case_presentations (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  instructions text not null default '',
  deadline timestamptz,
  section_ids uuid[] not null default '{}',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.case_submissions (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.case_presentations(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  status public.case_submission_status not null default 'not_started',
  patient_initials text check (patient_initials ~ '^[A-Z]{2,4}$'),
  age int check (age between 0 and 130),
  sex public.user_sex,                       -- enum from 032
  hospital text not null default '',
  ward text not null default '',
  admitting_diagnosis text not null default '',
  chief_complaint text not null default '',
  history text not null default '',
  medications text not null default '',
  nursing_diagnoses text not null default '',
  interventions text not null default '',
  observations jsonb not null default '{"vitals":[],"tpr":[],"ivf":[]}'::jsonb,
  submitted_at timestamptz,
  graded_by uuid references public.users(id) on delete set null,
  graded_at timestamptz,
  score numeric(5,2),
  remarks text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (presentation_id, student_id)
);
create index if not exists idx_case_submissions_student on public.case_submissions(student_id);

create table if not exists public.case_submission_ratings (
  submission_id uuid not null references public.case_submissions(id) on delete cascade,
  criterion text not null,
  rating text not null check (rating in ('excellent','satisfactory','needs_practice')),
  remarks text not null default '',
  rated_by uuid references public.users(id) on delete set null,
  rated_at timestamptz not null default now(),
  primary key (submission_id, criterion)
);
```

RLS: enable it on all three tables and write the policies in the 037 style. The API writes through
the service role; these policies are defence in depth.
- `case_presentations`: faculty and admin may select.
- `case_submissions`:
  - A student may select their own rows.
  - A student may update their own rows only while `status in ('not_started','draft')`
    (both `using` and `with check`).
  - Faculty and admin may select.
- `case_submission_ratings`: the owning student may select, faculty and admin may select.

### Task 1.2 — `web/supabase/migrations/057_faculty_verify_auto_tasks.sql`
```sql
-- Students no longer chart on ward patients, so no task can complete itself.
update public.scenario_tasks
   set verification = 'faculty', system_trigger = null
 where verification = 'system';
```
Keep the enum and the column; 024's check constraint still holds. Existing
`scenario_task_completions` rows (`completed_via='system'`) are left as history.

### Task 1.3 — Validate on a throwaway Postgres
- Start a local Postgres in the scratchpad, following [[live-db-diverges-from-migrations]].
- Apply `001…057` in order.
- Then run the checks below, each of which must behave as stated:
  - `insert … patient_initials='JD'` succeeds.
  - `'jd'`, `'Juan Dela Cruz'` and `'J'` are rejected.
  - `age = 131` is rejected.
  - After 057, `select count(*) from scenario_tasks where verification='system'` returns 0.

**Commit:** `feat(db): case presentations tables; auto tasks become faculty-verified`

---

## Phase 2 — Shared logic and APIs

### Task 2.1 — `web/app/lib/case-privacy.ts`
```ts
export const INITIALS_PATTERN = /^[A-Z]{2,4}$/;
/** "j.d." / "j d" / "jd" → "JD"; returns null if it can't be initials. */
export function normalizeInitials(raw: string): string | null {
  const s = raw.replace(/[^a-zA-Z]/g, '').toUpperCase();
  return INITIALS_PATTERN.test(s) ? s : null;
}
```

### Task 2.2 — `web/app/lib/case-rubric.ts`
- `CASE_CRITERIA`, a readonly array of `{ key, label, description }`:
  - `profile` — Patient profile & history
  - `assessment` — Assessment findings
  - `diagnoses` — Nursing diagnoses
  - `interventions` — Interventions & rationale
  - `delivery` — Presentation delivery
- `isCaseCriterion(key)`.
- `caseScore(ratings: Map<string, TaskRating>)` calls `gradedScore` with each criterion as a
  task of 10 points, `{ id: key, points: 10 }`, and each rating as `{ rating }`. This means an
  unrated criterion earns 0.
- `REQUIRED_FIELDS`, a readonly list of the columns the spec requires to submit.
  `missingFields(row)` returns the labels of the required fields that are empty.
- `sanitizeObservations(input)` keeps only the known keys:
  - `vitals`: heart_rate, bp_systolic, bp_diastolic, temperature_c, respiratory_rate,
    oxygen_saturation, pain_score, notes, observed_at
  - `tpr`: temperature_c, pulse, respiration, remarks, observed_at
  - `ivf`: solution, volume_ml, rate_ml_hr, site, remarks, observed_at

  It coerces numbers, caps each list at 50 entries and each text field at 500 characters, and
  drops anything else. That way no free-form keys, such as a name, can ride along.
- `isLate(submitted_at, deadline)`.

### Task 2.3 — `web/scripts/check-case-logic.ts`
Write plain assertions for:
- The `normalizeInitials` cases.
- `caseScore`: all Excellent = 100, all Satisfactory = 75, mixed values, and a missing
  criterion counting 0.
- `missingFields`.
- `sanitizeObservations`: it strips unknown keys and caps the lists.

Run it with `npx tsx scripts/check-case-logic.ts`.

### Task 2.4 — Faculty APIs
Every route uses `readSession` and `getSupabaseAdmin`. Only `faculty` and `admin` are allowed;
anyone else gets 403.

- **`app/api/faculty/cases/route.ts`**
  - `GET` lists presentations with a roster summary: counts by status and a late count.
    Faculty see the ones they created, plus any that target one of their sections
    (`getFacultySectionIds`). Admin sees the presentations in their scope.
  - `POST` takes `{ title, instructions, deadline, section_ids }`. It validates the input, then
    inserts the presentation and **assigns** it with the shared helper in Task 2.5.
    Audit entry: `case.create`.
- **`app/api/faculty/cases/[id]/route.ts`**
  - `GET` returns the presentation and its roster: each student's name, section, status,
    submitted_at, late flag and score.
  - `PATCH` updates title, instructions or deadline. If `section_ids` grows, it calls the assign
    helper again for the new sections.
  - `DELETE` is allowed only when no submission is `submitted` or `graded`; otherwise it returns
    409.
- **`app/api/faculty/cases/submissions/[id]/route.ts`**
  - `GET` returns the full submission, its ratings and `CASE_CRITERIA`.
  - `PUT` takes `{ ratings: {criterion: rating|null}, rating_remarks?, remarks?, finalize? }`:
    - Allowed only while the status is `submitted`; `graded` returns 409.
    - It upserts or deletes rows in `case_submission_ratings`.
    - With `finalize: true`, every criterion must be rated (400 otherwise). It then sets
      `score = caseScore`, `status='graded'`, `graded_by` and `graded_at`, writes the audit entry
      `case.grade`, and notifies the student (same notification insert as the assessment assign
      route).
- **Access check** (shared helper in `web/app/lib/cases.ts`): the student must be in the
  caller's scope, using `canAccessStudent` / `getScopedStudentIds` in `web/app/lib/admin-scope.ts`.

### Task 2.5 — `web/app/lib/cases.ts`
`assignCasePresentation(supabase, session, presentationId, sectionIds)` works like
`api/faculty/assessments/[id]/assign/route.ts`:
- Faculty may only use their own sections (403 with `invalid`).
- Resolve students by `section_id`, narrowed by `getScopedStudentIds`.
- Upsert `case_submissions` with `onConflict: 'presentation_id,student_id', ignoreDuplicates: true`,
  so existing rows are never touched.
- Notify only the students newly added.

It returns `{ added, total }`.

### Task 2.6 — Student APIs
Only `student` is allowed; every row must have `student_id === session.uid` (403 otherwise).

- **`app/api/student/cases/route.ts`**, `GET`: the student's submissions, each joined with its
  presentation (title, deadline, instructions), plus a late flag.
- **`app/api/student/cases/[id]/route.ts`**:
  - `GET` returns one submission and its presentation. Ratings and remarks are included only
    when the status is `graded`.
  - `PATCH` saves a draft:
    - Returns 409 unless the status is `not_started` or `draft`.
    - Accepts only the whitelisted fields. `patient_initials` goes through
      `normalizeInitials` (400 if invalid and non-empty); `age` must be an int from 0 to 130;
      `sex` must be one of the enum values; text is trimmed and capped at 4000 characters;
      `observations` goes through `sanitizeObservations`.
    - Sets `status='draft'` and `updated_at`.
- **`app/api/student/cases/[id]/submit/route.ts`**, `POST`:
  - Returns 409 unless the status is `draft`.
  - Returns 400 with `{ missing: [...] }` if required fields are missing.
  - Sets `status='submitted'` and `submitted_at`, and writes the audit entry `case.submit`.
  - Notifies the presentation's `created_by` plus the student's group supervisors
    (`getStudentSupervisorIds`, the same helper the vitals route uses). It inserts
    `notifications` rows directly; `notifyRosterFaculty` is local to the vitals route and
    specific to vitals, so it isn't reused.

### Task 2.7 — Web client types
Add `CasePresentation`, `CaseSubmission`, `CaseRating` and the faculty fetchers to
`web/app/lib/api.ts`, following the existing assessment fetchers there.

### Verification
- The check script and web typecheck pass.
- With `next dev` running and throwaway local data, **or** with 056 applied live (ask first,
  since live writes need approval), curl the flow in the spec's Verification section.

  If 056 is not live yet, stop after the typecheck and build and note that the API smoke test
  is pending the live apply.

**Commit:** `feat(cases): case presentation APIs — assign, draft, submit, grade`

---

## Phase 3 — Faculty web

### Task 3.1 — Navigation
In `web/app/faculty/layout-client.tsx`, add `{ id: "cases", label: "Case Presentations",
href: "/faculty/cases", icon: faFileMedical, section: "Teaching" }` after Skill Assessments.
Add the admin shell entry only if admin portals list the other Teaching pages; check first.

### Task 3.2 — `web/app/faculty/cases/page.tsx` and `page-client.tsx`
- The list shows title, sections, due date, status counts (Submitted / Graded / total) and a
  Late count.
- A "New case presentation" dialog has title, instructions, deadline and a sections
  multi-select (the faculty member's own sections). It POSTs, then refreshes.
- Reuse the dialog and table components from `web/app/faculty/assessments/`.

### Task 3.3 — `web/app/faculty/cases/[id]/page.tsx`
- The header shows title, due date and instructions, with Edit and Delete (Delete is disabled
  once anything has been submitted).
- The roster table shows student, section, status badge (Not started / Draft / Submitted /
  Graded, plus Late), score, and a "Grade" or "View" link.

### Task 3.4 — `web/app/faculty/cases/submissions/[id]/page.tsx`
- The left side shows the case read-only:
  - A patient card: initials, age, sex, hospital and ward, diagnosis, chief complaint.
  - Text sections: history, medications, nursing diagnoses, interventions.
  - Observation tables for vitals, TPR and IVF.
- The right side is the rubric, following the look of `faculty/scenarios/review/grading-table.tsx`:
  - Each of the 5 criteria has a three-button Excellent/Satisfactory/Needs Practice picker and
    a remarks box.
  - Overall remarks sit below the criteria.
  - A live score preview comes from `caseScore`.
  - "Save" and "Finalize grade" buttons; Finalize is disabled until all criteria are rated.
- Once the submission is graded, everything is read-only.

### Task 3.5 — Report
- Add a `case` type to `web/app/lib/reports/builders.tsx`, using `ReportShell`, `StatGrid` and
  `Table` from `kit.tsx`. The report has a patient card, the sections, the observations, the
  rubric results and remarks.
- Put a "Download PDF" link on the grading page:
  `/api/faculty/reports/case?id=<submissionId>&format=pdf`.

### Verification
- Typecheck and build pass.
- Do a visual check with [[visual-check-without-live-writes]]: the list, detail and grading
  pages, with non-GET requests intercepted.

**Commit:** `feat(cases): faculty case presentation pages and grading`

---

## Phase 4 — Mobile: Hospital Cases

### Task 4.1 — `mobile/lib/api.ts`
- Add the types, plus `fetchMyCases()` and `fetchCase(id)` built on `cachedGet`.
- Add `saveCaseDraft(id, patch)` and `submitCase(id)` built on `api`. They invalidate the
  cached GETs, the same way `submitScenarioAssignment` does.
- Add `mobile/lib/case-privacy.ts`, copying `INITIALS_PATTERN` and `normalizeInitials` from web.
  Put a comment in both files saying they must stay in sync.

### Task 4.2 — Observation forms (extract)
- Create `mobile/components/observations/VitalsForm.tsx`, `TprForm.tsx` and `IvfForm.tsx`.
- Each takes `{ onSave(entry), onCancel }` and holds its own field state. Lift the inputs and
  validation out of `clinic/patient/[id]/vitals.tsx`, `tpr.tsx` and `ivf.tsx`, but without the
  API calls, patient lookup or anomaly logic.
- Add an `ObservationList` that shows the saved entries with a delete action.

### Task 4.3 — `mobile/app/cases/[id].tsx` (editor)
- The screen is split into sections: Patient · Presentation · Nursing care · Observations.
- A privacy banner at the top reads: "Use initials only. Do not write names, hospital record
  numbers or birthdates anywhere in this case."
- The initials input uses `autoCapitalize="characters"` and `maxLength={4}`, and filters input
  to A–Z. It shows an inline error while the value fails `INITIALS_PATTERN`.
- Age uses the numeric keypad; sex is a two-option segmented control.
- Autosave calls `saveCaseDraft` 1 s after the student stops typing and when leaving the
  screen. It shows "Saved" or "Saving…".
- "Submit for grading" checks the required fields on the device first. It then confirms and
  calls `submitCase`, and shows the server's `missing` list if it returns 400.
- Read-only states:
  - `submitted` shows "Awaiting grading".
  - `graded` shows the score, each criterion's rating and remarks, and the overall remarks.

### Task 4.4 — Clinic tab
In `mobile/app/(tabs)/clinic.tsx`, add a "Hospital Cases" `SectionHeader` above Room Layout.
- Each card shows the title, due date and a status badge (plus Late).
- Tapping a card opens `router.push('/cases/<id>')`.
- If there are no cases, show an empty state: "No case presentations assigned yet."
- Load the list in the existing `useFocusEffect`.

### Verification
- Mobile typecheck passes.
- Run a manual pass in Expo:
  - The initials field refuses lowercase letters and digits.
  - Autosave survives leaving and reopening the screen.
  - Submit with a required field missing shows what's missing.
  - The graded view renders.

**Commit:** `feat(mobile): hospital case write-ups on the Clinic tab`

---

## Phase 5 — Remove ward charting and clean up the auto tasks

### Task 5.1 — Mobile ward screens
- In `mobile/app/clinic/patient/[id].tsx`:
  - Remove the four record actions, the note composer, the TPR/IVF history and the
    `fetchEhrRecords` calls.
  - Remove the `autoPending` count and warning. The submit prompt becomes the plain version.
  - Remove the Auto badge and the "Auto-completed" text on tasks.
  - Update the file's header comment.
  - Keep the brief, the latest-vitals display (it is read-only data the faculty entered), the
    checklist and Submit.
- In `mobile/app/clinic/assignment/[id].tsx`, remove the same auto-task UI.
- Delete `mobile/app/clinic/patient/[id]/vitals.tsx`, `tpr.tsx` and `ivf.tsx`. Their forms
  already live in `components/observations`.
- In `mobile/lib/api.ts`, remove `submitVitalReading`, `createEhrRecord`, `updateIvfStatus` and
  `fetchEhrRecords`, along with any offline queue entries for them. Before removing each one,
  grep for other callers.
- Remove any leftover mobile vitals-rules copy if nothing else uses it.

### Task 5.2 — Web auto-task code
- `web/app/lib/scenario-default-tasks.ts`: the two system tasks become
  `verification: 'faculty'` with no trigger.
- `web/app/lib/skill-tasks.ts:45`: stop setting `system_trigger`.
- `web/app/api/student/vitals/route.ts` and `web/app/api/student/ehr/route.ts`: remove the
  `autoCompleteScenarioTasks` calls. Keep the routes.
- Delete `autoCompleteScenarioTasks` from `web/app/lib/scenario-tasks.ts` if it has no
  callers left.
- `web/app/api/student/tips/route.ts`: remove the auto-task and trigger wording from the prompt.
- `web/app/faculty/scenarios/review/grading-table.tsx`: keep showing old `completed_via='system'`
  rows as history, but don't render trigger text for tasks that no longer have a trigger.
  `grading.ts` needs no change.

### Task 5.3 — Seed scripts
In `web/scripts/seed-basic-cases.ts` and `seed-student-history.ts`, write the formerly-system
tasks as faculty tasks and their completions as `completed_via='faculty'`. Don't run the seeds;
the user runs them.

### Verification
- Web and mobile typecheck and build pass.
- `grep -rn "system_trigger\|autoPending\|createEhrRecord" mobile web/app` finds only
  intentional leftovers: the types, and history display.

**Commit:** `refactor: remove student ward charting and auto-completing tasks`

---

## After Phase 5
- Update memory: add a case-presentations memory and update [[scenario-tasks-feature]]
  (auto tasks are gone).
- Tell the user to apply 056 and then 057 live. The backup already covers a rollback of 057.
- Flag the retraining follow-up for ML `clinical_activity_count`.
