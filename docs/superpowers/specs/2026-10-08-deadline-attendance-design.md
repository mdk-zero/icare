# Deadline attendance: activities replace Shifts

Date: 2026-10-08. Status: approved in brainstorming (parts 1–3), pending written-spec review.

## Context

Attendance today comes only from **Shifts** (029, 064): an instructor schedules a shift for a group, a student is checked in by signing in or using the app during it (`shift-presence.ts`), and an instructor can only excuse an absence. The user says shifts are no longer needed. Instead, every activity a student is given (a **Return Demonstration** (patient case, `scenario_assignments`), a **Quiz** (`assessment_assignments`) or a **Case Presentation** (`case_presentations`)) has a deadline, and that deadline *is* the attendance.

All three already carry a deadline column, but it is optional everywhere except group "Assign case", and nothing turns it into attendance. Late work is already accepted everywhere: nothing blocks a late quiz or RetDem, and late case presentations are only flagged.

## Decisions (user, 2026-10-08)

1. Statuses are **Present / Late / Absent**, plus Excused. Late counts as attended.
2. A RetDem is done when the instructor **grades its first task**.
3. Attendance shows **only on the student profile and in reports**. There is no attendance page.
4. Instructors can still **excuse an absence**, from the student's profile, with a reason.
5. A course checklist **Attendance item counts activities attended** ("Attend N activities").
6. Shift **tables and data stay in the database**. Only the code and UI go.
7. Approach **A: computed on read**. Only excuses are stored.

## The rules (pure module `app/lib/attendance.ts`)

No server imports, so the API, the reports, the course checklist and the demo share it, like `course-progress.ts`.

- **An activity** is one student's piece of deadline-bound work:
  - **RetDem:** a `scenario_assignments` row. `activity_id` is the assignment id.
  - **Quiz:** an `assessment_assignments` row. Its deadline is `coalesce(assignment.deadline, assessment.deadline)`. `activity_id` is the assignment id.
  - **Case Presentation:** one `case_submissions` row per assigned student. Assigning (`assignCasePresentation`) already creates a row for every group member it reaches, so the rows are the roster. Its deadline is the presentation's. `activity_id` is the presentation id.
- **Done at:**
  - RetDem: the earliest `scenario_task_completions.completed_at` for the assignment. A completion row is written when the instructor grades a task; since 057 every task is faculty-verified.
  - Quiz: the earliest `submitted_at` among the student's submitted attempts on that quiz. Older attempts and every demo attempt carry no `assignment_id`, so attempts are matched by student and quiz.
  - Case Presentation: `case_submissions.submitted_at`.
- **Status** at time `now`:

  | Deadline | Done at | Excused | Status |
  |---|---|---|---|
  | none | any | any | `no_deadline` (not counted) |
  | set | ≤ deadline | any | `present` |
  | set | > deadline | any | `late` |
  | > now | none | any | `upcoming` (not counted) |
  | ≤ now | none | no | `absent` |
  | ≤ now | none | yes | `excused` |

  Done always wins over an excuse: excused, then handed in late, is `late`. Exactly at the deadline is `present`.
- **Tally and rate:** counts of present, late, absent and excused. The rate is `(present + late) / (present + late + absent)`, or null when that denominator is 0. Excused, upcoming and no-deadline are left out. This replaces `tallyAttendance` in `shifts.ts`.
- **Exports** (names fixed here so the plan and the demo agree):
  - `type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused' | 'upcoming' | 'no_deadline'`
  - `type ActivityKind = 'scenario' | 'assessment' | 'case_presentation'`
  - `attendanceStatus({ deadline, done_at, excused }, now): AttendanceStatus`
  - `tallyAttendance(statuses): { present, late, absent, excused, rate }`
  - `attendedCount(statuses)`: present + late, used by the checklist item

## Deadlines become required

- **API:**
  - `POST /api/faculty/scenarios/[id]/assign` and `POST /api/faculty/cases` refuse a missing deadline with 400 "Set a deadline".
  - `POST /api/faculty/assessments/[id]/assign` does the same unless the assessment has its own default deadline.
  - `PATCH /api/faculty/cases/[id]` refuses clearing it.
  - `POST /api/faculty/teams/[id]/assign-cases` already requires one.
- **Forms:**
  - The deadline field is required in the patient case assign form (`faculty/scenarios/page-client.tsx`), the quiz assign form (`faculty/assessments/page-client.tsx`), and the case presentation create and edit forms (`faculty/cases/page-client.tsx`, `cases/[id]/page-client.tsx`).
  - The case form's "Due (optional)" becomes "Due".
- Existing activities with no deadline are left as they are: `no_deadline`, not counted, listed last on the profile.
- Late work stays accepted everywhere. Nothing new is blocked.

## Data: migration `068_activity_excuses.sql`

```sql
create table if not exists public.activity_excuses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  activity_kind text not null check (activity_kind in ('scenario', 'assessment', 'case_presentation')),
  activity_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  excused_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (activity_kind, activity_id, student_id)
);
```

- RLS is enabled with the same policy shape as 065's tables, and the server uses the service role.
- `activity_id` has no foreign key because it is polymorphic. An excuse for a deleted activity is never matched.
- Before 068 is applied, attendance computes with no excuses. Excuse and Undo return 503 "Excusing an absence needs database migration 068 (activity excuses) applied first."

## Server

- **New `app/lib/activity-attendance.ts`** (server) with `loadActivityAttendance(supabase, studentIds, { from?, to? })`:
  - It loads the three activity kinds with their deadlines and done times, plus excuses (falling back to none on 42P01/PGRST205).
  - It returns rows `{ student_id, kind, activity_id, title, deadline, done_at, excused: { reason, by, at } | null, status }`.
  - `from`/`to` filter by deadline, which is how the course term window is applied.
- **`GET /api/faculty/students/[id]/attendance`** returns `{ rows, tally, excuses_ready }`. It is scoped exactly like `GET /api/faculty/students/[id]`: faculty through `isStudentInFacultySections`, the Dean through `canSeeStudent`.
- **`POST /api/faculty/students/[id]/attendance/excuses`** takes `{ kind, activity_id, reason }`. **`DELETE`** takes `{ kind, activity_id }`.
  - Only faculty who supervise the student's group can call them.
  - POST is refused with 409 unless the activity is currently `absent`.
  - Both write an audit entry (`attendance.excuse` / `attendance.unexcuse`).
- **Course checklist** (`course-requirements.ts`):
  - `loadShifts` is replaced by `loadActivityAttendance` over the term window.
  - The `shift` count item's `current` = `attendedCount` of the student's activities whose deadline falls inside the term.
  - The code name stays `activity_type 'shift'` (UI-only rename, like `kind 'skill'`), so live and demo items keep working with no data change.
  - `AttendedShiftFact` becomes an attended-activity fact carrying the deadline as its date.
- **Reports** (`lib/reports/builders.tsx`):
  - Student report: the rate and the present/late/absent/excused counts come from `loadActivityAttendance`.
  - Section Attendance report: the tally and the by-student list with rates stay, and the by-shift grid becomes **by activity** (kind, title, deadline, each student's status).
  - Copy changes from "Clinical duty attendance … by shift" to activity attendance. `closeEndedShifts` calls go.

## UI

- **Student profile** (`faculty/students/[id]/page-client.tsx`) gets a sixth tab card, **Attendance**:
  - The card shows the hint "RetDems, quizzes, case presentations". Its count is the rate ("90%") or "—".
  - The new `attendance-tab.tsx` lists `upcoming` rows first, soonest first, then past ones, newest deadline first, then `no_deadline`.
  - Each row has the kind's icon, the title, the deadline, the done time, and a status chip.
  - `absent` rows have **Excuse**, a small reason dialog. `excused` rows show the reason and who excused it, with **Undo**. Neither action appears for viewers who can't excuse.
- **Course checklist:**
  - The Attendance topic blurb becomes "Counted from activities done by their deadline".
  - The modal's count option reads "Activities attended".
  - The count kind's hint becomes "A number of graded activities, or activities attended".
  - The detail line reads "15 activities attended" (was "15 shifts attended"), and the progress hover reads "N attended".
- **Dashboard:** the Duty card and `upcoming_shifts` go. "Due soon" and the overdue count stay.

## Removed

- **Pages:**
  - `faculty/attendance/` (page, page-client, shift-visuals) and the "Shifts" nav item in `faculty/layout-client.tsx`.
  - `/faculty/attendance` redirects to `/faculty`.
  - `SkeletonShiftCalendar` and `SkeletonShiftRoster`.
  - `_overview/DutyCard.tsx`.
- **API:**
  - `api/faculty/shifts/route.ts`, `api/faculty/shifts/[id]/route.ts` and `api/student/attendance/route.ts` (no caller).
  - Their helpers and types in `lib/api.ts` (`fetchMyAttendance`, `FacultyShift`…).
- **Server:**
  - `lib/shift-presence.ts`, and its calls in `lib/auth/session.ts`, `api/auth/login/route.ts` and `api/auth/google/route.ts`.
  - `lib/shift-scope.ts` and `lib/shifts.ts`.
  - The shift query in `lib/faculty-dashboard.ts`.
- **Demo:**
  - Shift fixtures and handlers.
  - The demo picker copy "…quizzes, shifts and grading" loses "shifts".
- **Scripts:** `scripts/seed-shift-schedule.ts`.
- **Left alone:**
  - The `shifts` and `shift_assignments` tables and their live rows.
  - Room assignments' rota `shift` label.
  - The patient chart's `shift` field.
  - Mobile home's "ON DUTY · AM SHIFT" clock greeting.
  - The login page's rotating word "shift".
  - Mobile is otherwise unchanged: students don't see attendance.

## Demo

- Demo patient cases, quizzes and case presentations get deadlines, with a spread of present, late, absent, upcoming and one excused absence per demo instructor's group.
- Handlers mirror the new GET and excuse routes, and the reports read the same data.
- The NCM 101/103 Attendance items count activities.

## Verification

- **New `scripts/check-attendance.ts` (`npm run check:attendance`)**, covering:
  - every table row above;
  - a done time exactly at the deadline is `present`;
  - excused then done late is `late`;
  - the rate leaves out excused, upcoming and no-deadline;
  - a rate is null with nothing counted;
  - a quiz with no assignment deadline uses the assessment's default.
- **`check:courses`:** an Attendance item counts present and late inside the term only (a deadline outside the term is ignored, and excused isn't counted). The label reads "15 activities attended".
- **`check:grading`:** attendance still can't be filed.
- **Migration:** 068 is run against a local throwaway Postgres (the live DB diverges from the migration files).
- **Build:** typecheck, eslint, and `NEXT_DIST_DIR=.next-build npm run build`.
- **Browser pass in demo mode** (no live writes):
  - the profile's Attendance tab, with Excuse, Undo and the 409 on a non-absent row;
  - required deadlines in the three forms;
  - the student and section Attendance reports;
  - no "Shifts" nav item, and `/faculty/attendance` redirects;
  - no Duty card;
  - the Attendance checklist item reads activities;
  - 390px with no overflow, and dark mode.
- **Live:** until 068 is applied, everything works except Excuse and Undo (503). Record "068 NOT live" in memory.
