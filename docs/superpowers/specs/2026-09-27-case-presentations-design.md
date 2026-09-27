# Hospital Case Presentations — Design

Status: draft for review · 2026-09-27 · Baseline: tag `v1.0-ehr-charting`, DB backup `db-backups/2026-09-27-pre-case-presentations`


## Context
RetDem is a skills demonstration against Taylor's checklists (docs/MoM-Sep-26.md). Students never
monitor a real patient during it, so charting vitals/TPR/IVF on simulated ward patients from the
mobile app adds nothing. What instructors actually assign is a **case presentation**: each student
presents their most interesting patient from hospital duty, identifying the patient only by
initials ("Juan Dela Cruz" → "JD").

Decisions agreed with the user (2026-09-27):
- Students **write up the case in the app** as a structured clinical record.
- **Keep ward, drop charting**: floor plan, ward patients and RetDem checklists stay on mobile;
  vitals/TPR/IVF/note entry on ward patients is removed for students.
- **Faculty assigns, then grades**: faculty create a Case Presentation for sections with a due
  date; each student submits one case; faculty grade it.
- **Grading = fixed rubric, 3-level ratings** (Excellent / Satisfactory / Needs Practice) reusing
  `web/app/lib/task-ratings.ts`, plus remarks.
- **Initials-only anonymity**: 2–4 capital letters, no record no./birthdate/photo fields, age as a
  number, privacy notice on free-text fields.
- **Approach A**: new tables, kept fully apart from `patients`, the floor plan, vitals alerts, ML
  and the data warehouse.

## Data model — migration `056_case_presentations.sql`
- `case_presentations`: id, title, instructions, deadline, section_ids uuid[] (→ `sections.id`),
  created_by → users, created_at.
- `case_submissions`: one row per student, created at assign time. The section is expanded to
  students the same way as `web/app/api/faculty/assessments/[id]/assign/route.ts`.
  - Columns: id, presentation_id (cascade), student_id, status (`not_started` | `draft` |
    `submitted` | `graded`), updated_at, `unique(presentation_id, student_id)`.
  - Patient fields: `patient_initials text check (patient_initials ~ '^[A-Z]{2,4}$')`,
    `age int check 0–130`, sex, hospital, ward.
  - Clinical fields: admitting_diagnosis, chief_complaint, history, medications,
    nursing_diagnoses, interventions.
  - `observations jsonb default '{"vitals":[],"tpr":[],"ivf":[]}'`, with each array item mirroring
    the existing vitals/TPR/IVF form fields.
  - Grading fields: submitted_at, graded_by, graded_at, score numeric, remarks.
- `case_submission_ratings`: submission_id, criterion (text key), rating (the 046 three-level
  scale), remarks, rated_by; primary key (submission_id, criterion).
- RLS: students can select their own rows, and update them only while status is `not_started`
  or `draft`. Faculty and admin can read. Section ownership is enforced in the API routes, as
  elsewhere.

## Lifecycle rules
- **Status.** Rows start as `not_started`. The student's first save moves the row to `draft`,
  and submitting moves it to `submitted`. Finalizing the grade moves it to `graded`. There is no
  "return for revision" step in this version.
- **Required to submit:** patient_initials, age, sex, admitting_diagnosis, chief_complaint,
  nursing_diagnoses and interventions. Observations and the other text fields are optional.
- **Deadline.** Submissions are accepted after the deadline and flagged as late when
  `submitted_at > deadline`. The app never blocks a late submission.
- **Roster.** Re-assigning a presentation upserts rows only for students not already on it, so
  students who joined the section later can be added. Existing rows are never touched.
- **Finalizing** requires a rating on all five rubric criteria. Remarks are optional.

## Migration `057_faculty_verify_auto_tasks.sql`
Update `scenario_tasks`: set `verification='faculty'` and `system_trigger=null` where
`verification='system'`. This satisfies the 024 CHECK constraint, and existing completions are
kept. In code:
- Update `DEFAULT_SCENARIO_TASKS` (`web/app/lib/scenario-default-tasks.ts`) and
  `web/app/lib/skill-tasks.ts:45` so nothing new gets a trigger.
- Remove the `autoCompleteScenarioTasks` calls from the student vitals and EHR POST routes.

## Shared logic
- `web/app/lib/case-rubric.ts`: fixed, equally weighted criteria:
  - Patient profile & history
  - Assessment findings
  - Nursing diagnoses
  - Interventions & rationale
  - Presentation delivery

  Score it with the existing `gradedScore`, `ratingForCredit` and `scoreDescriptor`.
- `web/app/lib/case-privacy.ts`: normalise initials (uppercase, strip dots and spaces, validate).
  The same regex is used client-side on mobile.

## API
- Faculty:
  - `/api/faculty/cases`: GET list, POST create + assign sections (only sections the faculty
    member handles).
  - `/api/faculty/cases/[id]`: GET returns the presentation with its submission roster;
    PATCH edits it; DELETE removes it.
  - `/api/faculty/cases/submissions/[id]`: GET, then PUT to save ratings and remarks. Setting
    `finalize` locks the submission, sets it to `graded`, and stores the score.
- Student:
  - `/api/student/cases`: GET my cases.
  - `/api/student/cases/[id]`: GET, and PATCH to save a draft.
  - `/api/student/cases/[id]/submit`: the server validates required fields, then sets
    `submitted`.
- Audit entries follow the existing `ehr.*` pattern: `case.submit`, `case.grade`.

## Web (faculty)
- A "Case Presentations" sidebar entry in the faculty shell, with list and create pages at
  `web/app/faculty/cases/`.
- The detail page shows the roster status (Not started / Draft / Submitted / Graded, with a Late flag).
- The grading view shows the case read-only, with a rubric table beside it that follows the
  `web/app/faculty/scenarios/review/grading-table.tsx` style.
- Add a `case` report type to `web/app/lib/reports/builders.tsx` so a graded case can be
  printed as a PDF.

## Mobile (student)
- Clinic tab (`mobile/app/(tabs)/clinic.tsx`): add a "Hospital Cases" section listing assigned
  presentations with their due date and status.
- New `mobile/app/cases/[id].tsx`: a sectioned editor that autosaves drafts. The initials input
  is restricted to A–Z with a max length of 4, and the privacy notice sits above the
  free-text fields.
- Observations: extract the form bodies of `clinic/patient/[id]/vitals.tsx`, `tpr.tsx` and
  `ivf.tsx` into `mobile/components/observations/*Form.tsx`. Each one saves to local state
  through `onSave` instead of calling the API; observations show as a list with delete.
- Remove charting from the ward:
  - In `clinic/patient/[id].tsx`, drop the four record actions and the TPR/IVF history.
  - Delete the three chart route screens once their forms are extracted.
  - Remove the `autoPending` warning and the Auto badge there and in
    `clinic/assignment/[id].tsx`.
  - Drop the now-unused `submitVitalReading`, `createEhrRecord` and `updateIvfStatus` from
    `mobile/lib/api.ts`.
- Update the task-trigger wording in `web/app/api/student/tips/route.ts` so the AI prompt no
  longer talks about auto tasks.

## Left as-is (flagged, not changed)
- The faculty patient chart, vitals alerts, discharge digest, dashboard counts and warehouse
  facts stay. They simply stop receiving new student data.
- The student vitals and EHR API routes remain but have no mobile caller.
- ML `clinical_activity_count` (`ml/app/features.py`) goes to 0 for new data. This is noted as a
  retraining follow-up, not changed now.
- Seed scripts that write system completions (`seed-basic-cases.ts`,
  `seed-student-history.ts`) are updated to write faculty completions.

## Phases (commit each after green typecheck and build)
1. Spec doc, plus migrations 056 and 057 validated on a local throwaway Postgres.
2. Shared libs and the student and faculty APIs.
3. Faculty web pages, plus the report type.
4. Mobile: the Hospital Cases list and editor, with the extracted observation forms.
5. Mobile: remove charting from the ward screens; auto-task code and seed cleanup.

## Verification
- Web: `npx tsc --noEmit` and `NEXT_DIST_DIR=.next-build npm run build`. Mobile: `npx tsc --noEmit`.
- Migration SQL: apply 001→057 on a local throwaway Postgres. Confirm the initials CHECK
  rejects `juan` and `Juan Dela Cruz` and accepts `JD`.
- API smoke tests:
  - A faculty member creates a case for their section and the roster rows exist.
  - A student saves a draft, submits, and a later PATCH is refused. Submitting without the required fields returns 400.
  - Faculty rate all 5 criteria and finalize; the score matches `gradedScore`.
  - A faculty member of another section gets 403.
- Visual check of the mobile editor and the faculty grading page.
- Remind the user to apply 056 and 057 live by hand.
