# Deadline Attendance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Attendance is computed from each RetDem, Quiz and Case Presentation's deadline. Instructors excuse absences from the student's profile. Shifts are removed.

**Architecture:**
- A pure module (`app/lib/attendance.ts`) turns activities (deadline + done time) and excuses into statuses, tallies and rows. The server loader, the demo, the course checklist and the reports all call it.
- Only excuses are stored (migration 068). Everything else is computed on read.
- Shift code and UI are deleted, but the shift tables stay.

**Tech Stack:** Next.js App Router (read `web/AGENTS.md`: this Next.js differs from what you know; check `node_modules/next/dist/docs/` before writing route or page code), supabase-js with the service role, Tailwind v4, FontAwesome, `@react-pdf/renderer` reports, and the in-browser demo (fetch patch).

**Spec:** `docs/superpowers/specs/2026-10-08-deadline-attendance-design.md`

## Global Constraints

- **Commits:** commit by path on `main` after a green typecheck and build: `git add -- <new files>` then `git commit <paths>`. Never commit the whole index. Don't push, and don't add a Co-Authored-By trailer.
- **Build:** `NEXT_DIST_DIR=.next-build npm run build` (a dev server runs on :3000). Typecheck with `npx tsc --noEmit`; lint with `npx eslint <changed files>`.
- **Tests:** there is no test runner. Checks are tsx scripts run through npm (`check:attendance`, `check:courses`, `check:grading`), and each exits non-zero on a failure.
- **No live DB writes:** the user applies 068. Validate it against a throwaway Postgres 18 cluster (`initdb`/`pg_ctl` on TCP `-h 127.0.0.1 -p <port> -c unix_socket_directories=''`, after creating roles `anon`, `authenticated` and `service_role`).
- **Code names stay:**
  - The Attendance checklist item is still `kind 'count'`, `activity_type 'shift'`.
  - Scenario assignments are "RetDem" / "Patient Case" in the UI.
  - Activity kinds are `'scenario' | 'assessment' | 'case_presentation'`.
- **Copy (verbatim from the spec):**
  - Statuses: Present, Late, Absent, Excused, Upcoming, No deadline.
  - The profile tab is "Attendance", with the hint "RetDems, quizzes, case presentations".
  - The topic blurb is "Counted from activities done by their deadline".
  - The count option is "Activities attended".
  - The count hint is "A number of graded activities, or activities attended".
  - The checklist label is "15 activities attended".
- **Errors (verbatim):**
  - "Set a deadline" (400).
  - "Only an absence can be excused" (409).
  - "Excusing an absence needs database migration 068 (activity excuses) applied first." (503).
- **Demo:** every new `/api` route needs a demo handler (the demo patches fetch in the browser). Handler files are registered in `app/lib/demo/router.ts`.
- **Request cache:** client write helpers go through the existing `courseRequest`-style helper so `clearRequestCache()` runs. UI order derived from fetched data is held in component state.
- **Late work stays accepted everywhere.** Nothing new is blocked.

## Review Focus

1. **A deadline typed in a form must mean that local time.** A date-only field ("2026-10-10") means the end of that local day. Today the RetDem and group forms send a bare date, read as midnight UTC (8 AM in Manila), and the quiz form sends a zoneless datetime that a UTC server reads 8 hours off. Pinned by Task 1's `deadlineFromInput` checks (run under `TZ=Asia/Manila`) and Task 4's wiring.
2. **Excuse sent twice** (a double-click, or two instructors): the second request answers 409, not 500. Task 2 maps unique violation 23505 to 409; Task 8 checks it in the demo, whose handler mirrors the route.
3. **Before 068 is applied:** the attendance GET still answers 200 with `excuses_ready: false`, and Excuse shows the migration message. Pinned by Task 1 (`isMissingExcusesTable`) and the Task 8 simulation.
4. **An excuse whose activity was deleted or reassigned** is ignored, never shown on another row. Pinned by Task 1's orphan-excuse check.
5. **A section report over 200 students:** every `in (...)` list in the loader is chunked (200 at a time, as `course-requirements.ts` does). Review item; there is no automated test.

---

### Task 1: Attendance rules (pure)

**Files:**
- Create: `web/app/lib/attendance.ts`, `web/app/lib/deadline-input.ts`, `web/scripts/check-attendance.ts`
- Modify: `web/package.json` (scripts)

**Interfaces:**
- Consumes: `Parsed<T>` from `app/lib/course-progress.ts`.
- Produces (`app/lib/attendance.ts`, no server imports):
  ```ts
  export type ActivityKind = 'scenario' | 'assessment' | 'case_presentation';
  export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused' | 'upcoming' | 'no_deadline';
  export const ATTENDANCE_LABEL: Record<AttendanceStatus, string>; // Present, Late, Absent, Excused, Upcoming, No deadline
  export interface ActivityFact { student_id: string; kind: ActivityKind; activity_id: string; title: string; deadline: string | null; done_at: string | null }
  export interface ExcuseFact { student_id: string; kind: ActivityKind; activity_id: string; reason: string; excused_by_name: string | null; created_at: string }
  export interface AttendanceRow extends ActivityFact { status: AttendanceStatus; excuse: { reason: string; by_name: string | null; at: string } | null }
  export interface AttendanceTally { present: number; late: number; absent: number; excused: number; rate: number | null } // rate: whole percent
  export interface ActivitySources {
    scenarioAssignments: { id: string; student_id: string; title: string; deadline: string | null }[];
    completions: { assignment_id: string; completed_at: string }[];
    quizAssignments: { id: string; student_id: string; assessment_id: string; title: string; deadline: string | null; default_deadline: string | null }[];
    attempts: { student_id: string; assessment_id: string; status: string; submitted_at: string | null }[];
    caseSubmissions: { student_id: string; presentation_id: string; title: string; deadline: string | null; submitted_at: string | null }[];
  }
  export function attendanceStatus(input: { deadline: string | null; done_at: string | null; excused: boolean }, now: number): AttendanceStatus;
  export function tallyAttendance(statuses: readonly AttendanceStatus[]): AttendanceTally;
  export function attendedCount(statuses: readonly AttendanceStatus[]): number;
  export function collectActivities(src: ActivitySources): ActivityFact[];
  export function attendanceRows(activities: readonly ActivityFact[], excuses: readonly ExcuseFact[], now: number): AttendanceRow[];
  export const MAX_EXCUSE_REASON = 300;
  export function parseExcuse(body: unknown): Parsed<{ kind: ActivityKind; activity_id: string; reason: string }>;
  export function isMissingExcusesTable(error: { code?: string } | null): boolean; // 42P01 or PGRST205
  export const EXCUSES_NEED_MIGRATION = 'Excusing an absence needs database migration 068 (activity excuses) applied first.';
  ```
- Produces (`app/lib/deadline-input.ts`): `deadlineFromInput(value: string): string | null`. It returns an ISO string. `""` gives null. `"YYYY-MM-DD"` gives 23:59 local that day. `"YYYY-MM-DDTHH:mm"` is read as local time. Anything else gives null.

Rules the body must follow (spec table):
- With no deadline, the status is `no_deadline`.
- `done_at <= deadline` is `present`, and `done_at > deadline` is `late`. Done always wins over an excuse.
- Not done before the deadline is `upcoming`. Not done after it is `excused` if excused, else `absent`.
- `rate = round(100 * (present + late) / (present + late + absent))`, or null when that is 0.
- `collectActivities`:
  - RetDem `done_at` is the earliest completion of that assignment.
  - Quiz `deadline` is `deadline ?? default_deadline`, and `done_at` is the earliest `submitted_at` among that student's attempts on that `assessment_id` with `status === 'submitted'`.
  - Case `done_at` is `submitted_at`. Its `activity_id` is `presentation_id`.
- `attendanceRows`:
  - Excuses match on `(student_id, kind, activity_id)`.
  - `excuse` is set only when the status is `excused`. Excuses with no matching activity are dropped.
  - Order: `upcoming` by deadline ascending, then past rows (present/late/absent/excused) by deadline descending, then `no_deadline` by title.

- [ ] **Step 1: Write the failing checks in `scripts/check-attendance.ts`**

  Copy the `check(label, ok, detail)` / `failures` style from `scripts/check-course-progress.ts`. Use `D = '2026-10-10T09:00:00.000Z'`, `BEFORE = Date.parse('2026-10-09T00:00:00Z')` and `AFTER = Date.parse('2026-10-11T00:00:00Z')`.
  - **`attendanceStatus`** (inputs at `AFTER` unless noted):

    | Input | Expected |
    |---|---|
    | `{deadline:null, done_at:D}` | `'no_deadline'` |
    | `done_at:'2026-10-10T08:00:00Z'` | `'present'` |
    | `done_at:D` (exactly) | `'present'` |
    | `done_at:'2026-10-10T09:00:01Z'` | `'late'` |
    | not done, at `BEFORE` | `'upcoming'` |
    | not done | `'absent'` |
    | not done, excused | `'excused'` |
    | done late, excused | `'late'` |
    | not done, excused, at `BEFORE` | `'upcoming'` |
  - **`tallyAttendance`:**
    - `['present','late','absent','excused','upcoming','no_deadline']` deep-equals `{present:1, late:1, absent:1, excused:1, rate:67}`.
    - `[]` gives `rate === null`. `['excused','upcoming']` gives `rate === null`.
  - **`attendedCount`:** `['present','late','absent','excused']` gives 2.
  - **`collectActivities`:**
    - A RetDem with completions at 10:00Z and 09:00Z gets `done_at` 09:00Z. One with none gets null.
    - A quiz with `deadline:null, default_deadline:D` gets deadline D.
    - Quiz attempts:
      - an `in_progress` attempt and an `expired` one are ignored;
      - another student's submitted attempt is ignored;
      - a submitted attempt on a different assessment is ignored;
      - the earliest submitted one wins.
    - A case submission gives `activity_id === presentation_id` and `done_at === submitted_at`.
  - **`attendanceRows`:**
    - Given an upcoming row at +2d, one at +1d, an absent at −1d, a present at −3d and a no-deadline row, the order is +1d, +2d, −1d, −3d, then no-deadline.
    - An excuse on the absent row gives `status 'excused'` with `excuse.reason` set.
    - An excuse on a present row leaves `excuse === null`.
    - An excuse whose `activity_id` matches nothing adds no row.
    - An excuse for a different student on the same activity doesn't apply.
  - **`parseExcuse`:**
    - `{kind:'scenario', activity_id:'a', reason:'  Sick  '}` gives ok with reason `'Sick'`.
    - A missing or blank reason gives an error containing "reason".
    - A 301-character reason gives an error.
    - `kind:'shift'` gives an error.
    - A missing `activity_id` gives an error.
  - **`isMissingExcusesTable`:** `{code:'42P01'}` and `{code:'PGRST205'}` are true. `{code:'23505'}` and `null` are false.
  - **`deadlineFromInput`** (the script runs under `TZ=Asia/Manila`):
    - `'2026-10-10'` gives `'2026-10-10T15:59:00.000Z'`.
    - `'2026-10-10T17:00'` gives `'2026-10-10T09:00:00.000Z'`.
    - `''` gives null. `'nope'` gives null.

- [ ] **Step 2: Add the script and watch it fail**

  Add `"check:attendance": "TZ=Asia/Manila tsx scripts/check-attendance.ts"` to `web/package.json` scripts.
  Run: `cd web && npm run -s check:attendance`
  Expected: it fails to start, because `app/lib/attendance.ts` cannot be resolved.

- [ ] **Step 3: Implement `app/lib/attendance.ts` and `app/lib/deadline-input.ts` to the interfaces and rules above**

- [ ] **Step 4: Run the checks**

  Run: `cd web && npm run -s check:attendance && npx tsc --noEmit`
  Expected: every line PASS, exit 0, no type errors.

- [ ] **Step 5: Commit**

  ```bash
  git add -- web/app/lib/attendance.ts web/app/lib/deadline-input.ts web/scripts/check-attendance.ts
  git commit web/app/lib/attendance.ts web/app/lib/deadline-input.ts web/scripts/check-attendance.ts web/package.json -m "feat(attendance): deadline attendance rules"
  ```

### Task 2: Excuses table, loader and attendance API

**Files:**
- Create:
  - `web/supabase/migrations/068_activity_excuses.sql`
  - `web/app/lib/activity-attendance.ts`
  - `web/app/api/faculty/students/[id]/attendance/route.ts`
  - `web/app/api/faculty/students/[id]/attendance/excuses/route.ts`
- Modify: `web/app/lib/api.ts`

**Interfaces:**
- Consumes: everything Task 1 produces; `isStudentInFacultySections` (`lib/roster.ts`); `canSeeStudent` (`lib/admin-scope.ts`); `logAudit` (`lib/audit.ts`); `requireRole`/`notFound`/`must` (`lib/courses.ts`).
- Produces:
  - `loadActivityAttendance(supabase, studentIds: string[], opts?: { from?: string; to?: string; now?: number }): Promise<{ rows: AttendanceRow[]; excusesReady: boolean }>` in `lib/activity-attendance.ts`.
    - It reads `scenario_assignments` (+ `scenarios(title)`) with `scenario_task_completions`, `assessment_assignments` (+ `assessments(title, deadline)`) with the students' `assessment_attempts`, `case_submissions` (+ `case_presentations(title, deadline)`), and `activity_excuses` (+ `users!activity_excuses_excused_by_fkey(name)`).
    - It feeds `collectActivities`, then `attendanceRows`.
    - With `from`/`to`, it keeps rows whose deadline satisfies `from <= deadline < to`. Rows with no deadline are dropped when a window is given.
    - Every `.in()` is chunked by 200. A missing excuses table (42P01/PGRST205) gives `excusesReady: false` and no excuses.
  - `GET /api/faculty/students/[id]/attendance` returns `{ rows: AttendanceRow[]; tally: AttendanceTally; can_excuse: boolean; excuses_ready: boolean }`.
    - Access: copy `app/api/faculty/students/[id]/route.ts`, not `requireRole('faculty')`, which would refuse the Dean. A faculty or admin session is required. Faculty pass through `isStudentInFacultySections` and admins through `canSeeStudent`; otherwise 404 'Student'. Other roles get 403.
    - `tally` is over all rows. `can_excuse` is `role === 'faculty'`.
  - `POST /api/faculty/students/[id]/attendance/excuses` takes `{ kind, activity_id, reason }`.
    - Faculty only, and the student must be in their group (else 404).
    - `parseExcuse` failures give 400.
    - It recomputes the student's rows: no match gives 404 'Activity'; a status other than `absent` gives 409 "Only an absence can be excused".
    - It inserts the excuse with `excused_by = session.uid`. 23505 gives 409 "Only an absence can be excused". A missing table gives 503 `EXCUSES_NEED_MIGRATION`.
    - Audit: `logAudit(session, { action: 'attendance.excuse', entityType: 'activity_excuses', entityId: <new id>, details: { student_id, kind, activity_id, title, reason } }, request)`.
    - Returns `{ row: AttendanceRow }`.
  - `DELETE` on the same path takes the body `{ kind, activity_id }`. Same access rules. If no row is deleted, 404 'Excuse'. A missing table gives 503. It audits `attendance.unexcuse` and returns `{ row: AttendanceRow }`.
  - In `lib/api.ts`:
    - `StudentAttendance = { rows: AttendanceRow[]; tally: AttendanceTally; can_excuse: boolean; excuses_ready: boolean }`;
    - `fetchStudentAttendance(studentId)`;
    - `excuseAbsence(studentId, input: { kind: ActivityKind; activity_id: string; reason: string })`;
    - `undoExcuse(studentId, input: { kind: ActivityKind; activity_id: string })`.

    All three use `courseRequest<T>` the way `fetchStudentRequirements` does: `{ data?, error? }`, and writes clear the request cache.

- [ ] **Step 1: Write `068_activity_excuses.sql`**

  Use the spec's DDL verbatim, plus:
  - `create index if not exists idx_activity_excuses_student on public.activity_excuses(student_id);`
  - `alter table public.activity_excuses enable row level security;`

  Add no policies; this is service-role only, like 065. Write a header comment in the style of 064/067.

- [ ] **Step 2: Validate 068 on a throwaway cluster**

  Start Postgres 18 on TCP in the scratchpad and create the three roles. Create a minimal `public.users(id uuid primary key)` and the `gen_random_uuid` prerequisite, then apply 068 twice (it must be idempotent). Then:
  - insert a valid excuse;
  - insert a duplicate `(kind, activity, student)`: expect ERROR 23505;
  - insert a reason of `repeat('x',301)`: expect a check violation;
  - insert a reason of `'   '`: expect a check violation;
  - insert `activity_kind 'shift'`: expect a check violation.

  Expected: exactly those errors, and the second apply is a no-op.

- [ ] **Step 3: Implement `lib/activity-attendance.ts`, the two routes and the `api.ts` helpers to the interfaces above**

- [ ] **Step 4: Verify**

  Run: `cd web && npx tsc --noEmit && npx eslint app/lib/activity-attendance.ts "app/api/faculty/students/[id]/attendance" app/lib/api.ts && npm run -s check:attendance`
  Expected: clean, with check:attendance all PASS.

- [ ] **Step 5: Build and commit**

  Run: `cd web && NEXT_DIST_DIR=.next-build npm run build` (expect exit 0).
  Then `git add --` the four new files, and `git commit` them with `web/app/lib/api.ts`, message `feat(attendance): excuses table and the student attendance API`.

### Task 3: The checklist's Attendance item counts activities

**Files:**
- Modify:
  - `web/app/lib/course-progress.ts` (AttendedShiftFact, ProgressFacts, evaluate, judge, COUNT_NOUN, entryMode comment)
  - `web/app/lib/course-requirements.ts` (`loadShifts` → attended activities)
  - `web/app/lib/demo/handlers/courses.ts:725-735`
  - `web/app/faculty/courses/topics.tsx:96-104`
  - `web/app/faculty/courses/[id]/requirement-modal.tsx:43,70`
  - `web/app/faculty/courses/progress-ui.tsx` (comments only)
  - `web/app/lib/course-grading.ts:60` (comment)
  - `web/scripts/check-course-progress.ts`, `web/scripts/check-course-grading.ts`

**Interfaces:**
- Consumes: `loadActivityAttendance` (Task 2); `attendanceRows`, `collectActivities` (Task 1).
- Produces:
  - `AttendedActivityFact { student_id: string; deadline: string }` replaces `AttendedShiftFact`.
  - `ProgressFacts.attended: AttendedActivityFact[]` replaces `ProgressFacts.shifts`, and `NO_FACTS` follows.
  - `evaluate` keeps `attended` rows whose `deadline` is in the term (`inTerm`). A `count`/`shift` item's dates are those deadlines.
  - The loader passes only rows with status `present` or `late`.
  - `COUNT_NOUN.shift = ['activity', 'activities']`, so `requirementLabel` gives "15 activities attended" and "1 activity attended".

- [ ] **Step 1: Update `check-course-progress.ts` first**

  Rename every `shifts:` fact to `attended:` with `{ student_id, deadline }`. Add:
  - **"attendance counts activities inside the term":**
    - The term is Jun 22 – Oct 24, 2026, and the item is `{kind:'count', activity_type:'shift', target_count:2}`.
    - Attended facts at deadlines 2026-07-01, 2026-08-01 and 2026-11-05 give `current === 2`, `done === true`.
    - With only the November one, `current === 0`.
  - **Labels:** `requirementLabel` of `{kind:'count', activity_type:'shift', target_count:15}` is `'15 activities attended'`, and with `target_count:1` it is `'1 activity attended'`.

  In `check-course-grading.ts`, keep the "attendance can't be filed" checks and update only the fact shape if it builds `ProgressFacts`.

- [ ] **Step 2: Run them and watch them fail**

  Run: `cd web && npm run -s check:courses; npm run -s check:grading`
  Expected: `check:courses` fails on a type/shape error or on the new labels (it still says "shifts").

- [ ] **Step 3: Implement the course-progress changes**

  - In `course-requirements.ts`, replace `loadShifts` with a call to `loadActivityAttendance(supabase, studentIds, { from, to })`, mapped to `{ student_id, deadline }` for `present`/`late` rows. Keep the `wantsShifts` gate, renamed `wantsAttendance`.
  - In the demo's `courses.ts` fact builder, compute the same through `collectActivities` + `attendanceRows` over `db.assignments`, `db.completions`, `db.quizAssignments` (+ `db.quizzes` title; `default_deadline` is the quiz's `deadline` if `DemoQuiz` has one, else null), `db.attempts` and `db.caseSubmissions` (+ `db.casePresentations`), with `db.excuses ?? []`.
  - Copy:
    - `topics.tsx` blurb: "Counted from activities done by their deadline".
    - Modal count hint: "A number of graded activities, or activities attended".
    - `ACTIVITY_TYPES` shift label: "Activities attended".
  - Update the comments that say "shift" to "attendance" wherever they describe this item.

- [ ] **Step 4: Run the checks**

  Run: `cd web && npm run -s check:courses && npm run -s check:grading && npm run -s check:attendance && npx tsc --noEmit`
  Expected: all PASS, no type errors.

- [ ] **Step 5: Build and commit**

  Build as in Task 2. Then `git commit` the modified paths, message `feat(courses): the Attendance item counts activities attended`.

### Task 4: Deadlines are required, and mean local time

**Files:**
- Modify (API):
  - `web/app/api/faculty/scenarios/[id]/assign/route.ts:52-56`
  - `web/app/api/faculty/assessments/[id]/assign/route.ts:52-56`
  - `web/app/api/faculty/cases/route.ts:118-121`
  - `web/app/api/faculty/cases/[id]/route.ts:146-151`
- Modify (forms):
  - `web/app/faculty/scenarios/page-client.tsx` (assign call ~436)
  - `web/app/faculty/teams/AssignCasesModal.tsx:51`
  - `web/app/faculty/assessments/page-client.tsx:249-258,549`
  - `web/app/faculty/cases/page-client.tsx:204,240`
  - `web/app/faculty/cases/[id]/page-client.tsx:265`
- Modify (demo): the matching handlers in `web/app/lib/demo/handlers/faculty.ts` (scenario assign ~980, group assign ~778), `quizzes.ts` (~405) and `teaching.ts` (case create/patch).

**Interfaces:**
- Consumes: `deadlineFromInput` (Task 1).
- Produces:
  - `parseDeadline(value: unknown, opts?: { optional?: boolean }): Parsed<string | null>` in `app/lib/deadline-input.ts`.
    - Missing or blank gives `{ ok:false, error:'Set a deadline' }`, unless `optional`, which gives `{ ok:true, value:null }`.
    - Unparsable gives `{ ok:false, error:'Invalid deadline' }`.
    - Otherwise `{ ok:true, value: <ISO> }`.
    - All four routes and their demo handlers call it. The quiz route passes `optional: assessment.deadline !== null`.
  - Every assign/create request carries an ISO deadline.
  - The servers answer 400 "Set a deadline" when it's missing. For quizzes, that applies only when the assessment has no `deadline` of its own: read `assessments.deadline` in the assign route.
  - `PATCH /api/faculty/cases/[id]` with `deadline: null` or `''` answers 400 "Set a deadline".

- [ ] **Step 1: Write the failing `parseDeadline` checks in `check-attendance.ts`, and run them**

  - `parseDeadline(undefined)` and `parseDeadline('  ')` give the error 'Set a deadline'.
  - `parseDeadline('', { optional: true })` gives `{ ok: true, value: null }`.
  - `parseDeadline('soon')` gives the error 'Invalid deadline'.
  - `parseDeadline('2026-10-10T09:00:00.000Z')` gives value `'2026-10-10T09:00:00.000Z'`.

  Run: `cd web && npm run -s check:attendance`
  Expected: FAIL (`parseDeadline` is not exported).

- [ ] **Step 2: Wire the forms**

  - Every form converts with `deadlineFromInput` before sending: scenario assign, group assign, quiz assign, case create and case edit. The case forms replace `fromLocalInput`.
  - Labels: the quiz form's "Deadline (optional)" becomes "Deadline", and the case form's "Due (optional)" becomes "Due". The inputs get `required`.
  - Submit stays disabled without a deadline, as the scenario form already does. On the quiz form, a deadline isn't needed when the assessment has its own default (`assignTarget.deadline`): show it as the input's placeholder.

- [ ] **Step 3: Implement `parseDeadline`, then enforce it in the four routes and the demo handlers**

  It replaces each route's own parse. The message is exactly "Set a deadline". The demo scenario assign at `faculty.ts:980` stops defaulting to +7 days.

- [ ] **Step 4: Verify**

  Run: `cd web && npx tsc --noEmit && npx eslint <changed files> && npm run -s check:attendance`
  Expected: clean, all PASS.

- [ ] **Step 5: Build and commit**

  Build, then `git commit` the changed paths, message `feat(deadlines): every activity needs a deadline, in local time`.

### Task 5: The Attendance tab on the student profile

**Files:**
- Create:
  - `web/app/faculty/students/[id]/attendance-tab.tsx`
  - `web/app/lib/demo/handlers/attendance.ts`
- Modify:
  - `web/app/faculty/students/[id]/page-client.tsx:308,727-740,816-818`
  - `web/app/lib/demo/router.ts:96-103` (register the handler)
  - `web/app/lib/demo/fixtures/school.ts` or `teaching.ts` (seed `excuses`)
  - `web/app/lib/demo/fixtures/index.ts`

**Interfaces:**
- Consumes: `fetchStudentAttendance`, `excuseAbsence`, `undoExcuse`, `StudentAttendance` (Task 2); `ATTENDANCE_LABEL`, `AttendanceRow`, `MAX_EXCUSE_REASON`, `EXCUSES_NEED_MIGRATION`, `parseExcuse`, `attendanceRows`, `collectActivities`, `tallyAttendance` (Task 1).
- Produces:
  - `useStudentAttendance(studentId)`: `usePageData('faculty:student-attendance:' + id, ...)`.
  - `default AttendanceTab({ studentId, studentName })`.
  - `DemoExcuse = ExcuseFact & { id: string }` and `db.excuses: DemoExcuse[]`. Seed one excused absence: the first `absent` RetDem in the demo instructor's first group, with reason "Medical certificate submitted."
  - Demo routes `GET /api/faculty/students/:id/attendance` and `POST`/`DELETE /api/faculty/students/:id/attendance/excuses`, mirroring Task 2's statuses, messages and payloads. Every read uses `db.excuses ?? []`, because a store saved before this change has no `excuses`.

UI rules:
- **Tile:** the sixth tile in the tab grid is `{ key: 'attendance', label: 'Attendance', hint: 'RetDems, quizzes, case presentations', count: rate === null ? '—' : rate + '%', unit: 'attended', icon: faCalendarCheck }`. Widen the grid to fit six (`2xl:grid-cols-6`).
- **Header:** the tab shows the tally as chips: Present N · Late N · Absent N · Excused N.
- **Rows:** in `attendanceRows` order, each row has:
  - the kind icon: RetDem `faStethoscope`, Quiz `faClipboardQuestion` or the icon the profile already uses for quizzes, Case Presentation from the cases pages;
  - the title, and a "Due <date, time>" line ("No deadline" when none), with "Done <date, time>" when `done_at` is set;
  - a status chip coloured from the existing palette tokens: present emerald, late amber, absent rose, excused slate, upcoming sky, no deadline gray.
- **Actions** (only when `can_excuse`):
  - An absent row shows an **Excuse** button. It opens a small dialog with a textarea (`maxLength={MAX_EXCUSE_REASON}`, required) and Save/Cancel.
  - An excused row shows "Excused by <name>: <reason>" and an **Undo** button.
  - On success, replace that row in local state from the response's `row`. On an error, show it in the dialog or as a toast.
  - With `excuses_ready === false`, the Excuse button is disabled with `title={EXCUSES_NEED_MIGRATION}`.
- **Empty and loading:** an empty list says "No RetDems, quizzes or case presentations yet." Loading uses the same pulse block as the requirements tab.

- [ ] **Step 1: Write the demo-side check first**

  Add to `check-attendance.ts`: build the demo seed (`seed()` from `app/lib/demo/fixtures`) and assert:
  - `db.excuses.length >= 1`;
  - running `collectActivities` + `attendanceRows` over the seed gives at least one row each of `present`, `late`, `absent`, `excused` and `upcoming`.

  Run it.
  Expected: FAIL (no `excuses` in the seed). If importing the fixtures pulls in browser-only modules, assert over the specific fixture functions instead and record a ruling.

- [ ] **Step 2: Seed `excuses`, and adjust fixture deadlines or attempts only as far as needed for the five statuses**

  Run `check:attendance`. Expected: PASS.

- [ ] **Step 3: Implement the demo handlers and register them, then build `attendance-tab.tsx` and wire the tile and the tab**

- [ ] **Step 4: Verify**

  Run: `cd web && npx tsc --noEmit && npx eslint <changed and new files> && npm run -s check:attendance`
  Expected: clean, all PASS.

- [ ] **Step 5: Build and commit**

  Build. `git add --` the new files, then `git commit` with the modified ones, message `feat(attendance): Attendance tab on the student profile`.

### Task 6: Reports read activity attendance

**Files:**
- Modify:
  - `web/app/lib/reports/builders.tsx` (student report ~95-235; `buildAttendanceReport` ~796-960)
  - `web/app/faculty/reports/page-client.tsx:233-317` (blurb and contents)
  - `web/app/lib/demo/reports.tsx` (~55-75, `attendanceReport` ~190-205)

**Interfaces:**
- Consumes: `loadActivityAttendance` (Task 2); `tallyAttendance`, `ATTENDANCE_LABEL`, `attendanceRows`, `collectActivities` (Task 1).
- Produces:
  - **Student report:**
    - The Summary "Attendance" tile shows `pct(tally.rate)` from activities.
    - The section is titled "Attendance" and shows Present/Late/Absent/Excused counts.
    - The note's last sentence reads "Attendance counts late as attended and leaves excused and upcoming activities out."
  - **Section report:**
    - `buildAttendanceReport` loads the section's in-scope students' rows (no window).
    - Heading "Attendance Report"; the meta row "Activities" counts distinct `(kind, activity_id)`.
    - The Summary drops "Unmarked" and adds "Upcoming".
    - The by-student table is unchanged in shape.
    - The by-shift table becomes **"By activity"**: columns `['Activity', 'Due', 'Present', 'Late', 'Absent', 'Excused']`, one row per distinct activity, newest deadline first. Its empty text is "No activities with a deadline yet."
    - The footnote is "Rate counts present and late as attended. Excused and upcoming activities are left out of the rate."
  - **Reports page:** the attendance card's blurb is "Activity attendance for a section, by student and by activity", and its contents are `["Present / late / absent tally", "By student with rate", "By activity"]`. The student card's contents keep "Averages and attendance".
  - **Demo reports:** the same, from the demo rows.

- [ ] **Step 1: Write the failing check**

  Add to `check-attendance.ts` a `byActivity(rows: AttendanceRow[])` expectation, exported from `attendance.ts` for the section report. It groups by `(kind, activity_id)` and returns `{ kind, activity_id, title, deadline, tally }[]`, newest deadline first, skipping `no_deadline`. Use two activities and three students, with statuses giving tallies `{present:2, absent:1}` and `{late:1, excused:2}`.
  Run it. Expected: FAIL (`byActivity` not exported).

- [ ] **Step 2: Implement `byActivity` in `attendance.ts`**

  Run `check:attendance`. Expected: PASS.

- [ ] **Step 3: Rewrite the two builders, the page copy and the demo reports**

  Remove `closeEndedShifts` and the `shifts` imports from `builders.tsx`.

- [ ] **Step 4: Verify**

  Run: `cd web && npx tsc --noEmit && npx eslint app/lib/reports/builders.tsx app/faculty/reports/page-client.tsx app/lib/demo/reports.tsx && npm run -s check:attendance`
  Expected: clean, all PASS.

- [ ] **Step 5: Build and commit**

  Message: `feat(reports): attendance from activity deadlines`.

### Task 7: Shifts removed

**Files:**
- Delete:
  - `web/app/faculty/attendance/page-client.tsx`, `web/app/faculty/attendance/shift-visuals.tsx`
  - `web/app/api/faculty/shifts/route.ts`, `web/app/api/faculty/shifts/[id]/route.ts`
  - `web/app/api/student/attendance/route.ts`
  - `web/app/lib/shift-presence.ts`, `web/app/lib/shift-scope.ts`, `web/app/lib/shifts.ts`
  - `web/app/faculty/_overview/DutyCard.tsx`
  - `web/scripts/seed-shift-schedule.ts`
- Rewrite: `web/app/faculty/attendance/page.tsx` becomes `redirect("/faculty")`, with a comment in the style of `faculty/patients/page.tsx`.
- Modify:
  - `web/app/faculty/layout-client.tsx:93-99` (drop the Shifts item; drop `faCalendarCheck` if unused)
  - `web/app/lib/auth/session.ts:8,50-53`, `web/app/api/auth/login/route.ts:2,54-55`, `web/app/api/auth/google/route.ts:2,87-88`
  - `web/app/lib/faculty-dashboard.ts` (`DutyShift`, `upcoming_shifts`, the `ShiftRow` query, `closeEndedShifts`)
  - `web/app/faculty/page-client.tsx:57,85-96,208` (drop DutyCard and the "on duty" sentence)
  - `web/app/lib/api.ts` (lines 5, 1113, 2363-2525: shift types and helpers, `fetchMyAttendance`)
  - `web/app/components/skeletons.tsx:541-600`
  - `web/app/login/DemoPicker.tsx:22`
  - Demo:
    - `web/app/lib/demo/fixtures/school.ts` (`DemoShift`, `DemoShiftEntry`, shift seeding ~656-732)
    - `handlers/ward.ts` (shift routes and helpers; keep the census, rooms and vitals)
    - `handlers/faculty.ts` (~221-269 upcoming, ~464)
    - `handlers/admin.ts` (~284)
    - `handlers/derive.ts` (~165-173: `attendance_rate` from the demo activity rows' `tallyAttendance(...).rate ?? 100`)
    - `handlers/super-admin.ts:172`
    - `fixtures/audit.ts:31,34` (reword as `attendance.excuse`)
    - `fixtures/system.ts:32,40,118` (reword the fake test names: "excuses an absence", "builds a section attendance PDF", and "Timed out waiting for the attendance tab to render")

**Interfaces:**
- Consumes: nothing new. By now Tasks 3 and 6 no longer import `shifts.ts`, `shift-presence.ts` or `shift-scope.ts`.
- Produces: no Shifts code. `FacultyOverview` has no `upcoming_shifts`.

- [ ] **Step 1: Write the guard**

  Run: `cd web && grep -rln "shift-presence\|shift-scope\|lib/shifts\|/api/faculty/shifts\|upcoming_shifts\|shiftEntries\|DutyCard\|recordShiftActivity\|closeEndedShifts" app scripts`
  Expected now: a non-empty list (the files above). This list is the work.

- [ ] **Step 2: Delete and edit the listed files until the same grep prints nothing**

  Don't touch:
  - room assignments' `shift` field (`api/admin/rooms/**`, `RoomModals.tsx`);
  - the patient chart's `shift` (`PatientChart.tsx`, `api/student/ehr`);
  - `login/page.tsx`'s rotating word;
  - mobile;
  - the `shifts`/`shift_assignments` tables and migrations 029/064.

- [ ] **Step 3: Verify**

  Run: the grep from Step 1, then `cd web && npx tsc --noEmit && npx eslint <changed files> && npm run -s check:attendance && npm run -s check:courses && npm run -s check:grading`
  Expected: the grep prints nothing, and everything else is clean and PASS.

- [ ] **Step 4: Build and commit**

  Build, expecting exit 0 and no `/faculty/attendance` client bundle. Commit the deletions and edits by path. Deleted paths need `git rm` (its own pathspec only), then `git commit <paths>`, message `remove(shifts): attendance comes from activity deadlines now`.

### Task 8: Browser pass and records

**Files:**
- Create: scratchpad scripts under the existing `pp/` (puppeteer-core + system Firefox, `pp/lib.mjs` helpers `open`, `startDemo`, `go`, `text`, `sleep`).
- Modify (memory, outside the repo):
  - `shift-groups.md` (retired 2026-10-08, tables kept);
  - `courses-and-requirements.md` (Attendance item counts activities);
  - `live-migration-status.md` (068 NOT live);
  - `MEMORY.md` pointers;
  - a new `deadline-attendance.md`.

- [ ] **Step 1: Demo pass as Instructor** (write the script, run it, read every line)

  Each item is pass or fail:
  1. The nav has no "Shifts". `/faculty/attendance` lands on `/faculty`. The dashboard has no Duty card and no "on duty" sentence.
  2. The student profile has an Attendance tile with a percent. The tab lists rows in order, with all five statuses across the demo group.
  3. Excuse on an absent row: the dialog, then Save, then the row reads Excused with the reason, and the tile's rate is unchanged (excused is left out). Undo makes it Absent again.
  4. A second POST excuse on the same row (via `fetch` in the page) answers 409.
  5. The assign forms: the quiz deadline is required, and the case "Due" is required. Assigning a RetDem due today, then grading its first task now, reads Present (not Late).
  6. Reports: the student report PDF and the section Attendance report generate (200, PDF bytes).
  7. The course Attendance item reads "… activities attended".
  8. At 390px: no horizontal overflow on the profile tab. Dark mode is legible.
  9. A pre-068 simulation (the real API isn't reachable in the demo): patch the demo response for the excuse POST to 503 with `EXCUSES_NEED_MIGRATION`. The dialog shows that message.

  Expected: 9/9 PASS. Fix any failure through systematic debugging, then rerun.

- [ ] **Step 2: Update memory files and the MEMORY.md index**

- [ ] **Step 3: Final checks**

  Run: `cd web && npm run -s check:attendance && npm run -s check:courses && npm run -s check:grading && npx tsc --noEmit && NEXT_DIST_DIR=.next-build npm run build`
  Expected: all green.
