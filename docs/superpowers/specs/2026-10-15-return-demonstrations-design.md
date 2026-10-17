# Return Demonstrations: skill checklists with no patient

Date: 2026-10-15. Status: approved in brainstorming (sections 1–3), pending written-spec review.

## Context

A **Patient Case** (`scenarios`) is a scenario built on a patient: a brief, a room, and tasks that are Taylor's skills whose sub-tasks are the skill's checklist steps word for word (045, 047). The instructor grades each step live on `/faculty/scenarios/review` (Excellent 3 / Satisfactory 2 / Needs Practice 1, plus N/A out of the score since 071), finalizes, and the student sees the result on mobile.

The user wants a **Return Demonstration** activity: "basically the same as Patient Cases but without the Scenarios. Only the checklists that the students will demonstrate one by one", with its own tab in the instructor's Teaching section.

Until now the app has used "RetDem" to mean a Patient Case: attendance labels them that way, and the 2026-10-08 attendance spec calls a patient case a Return Demonstration. The course Grading tab also uses "Return Demonstrations" for the pre-070 checklist item kind `skill`. Both uses have to give the name up.

## Decisions (user, 2026-10-15)

1. **Rating scale:** the same as Patient Cases. It is Excellent / Satisfactory / **Needs Practice** / N/A, worth 3 / 2 / 1 points, with N/A out of the score. The user asked for "Needs Improvement" at first, then chose to keep "Needs Practice".
2. **Contents:** one Return Demonstration holds **one or more Taylor's skills**. Each skill's checklist steps come word for word from the catalog. There are no hand-written steps.
3. **Student side:** students get **preview + results**. They see the skills and steps ahead of time to prepare, and the ratings after it is finalized. There is no Start button and no timer.
4. **Assigning:** the instructor assigns from the Return Demonstration's own page, choosing **groups and/or individual students** they supervise, with a deadline. Each student gets their own copy and is graded on their own.
5. **Approach A:** a Return Demonstration is a `scenarios` row with `kind = 'return_demo'` and no patient. It reuses the Patient Case tables, grading engine and routes.
6. **Teaching tab:** a new "Return Demonstrations" item sits in the sidebar's Teaching section, after Patient Cases.

## Data: migration 072

```sql
alter table public.scenarios
  add column if not exists kind text not null default 'patient_case';
alter table public.scenarios drop constraint if exists scenarios_kind_ck;
alter table public.scenarios add constraint scenarios_kind_ck
  check (kind in ('patient_case', 'return_demo'));
create index if not exists idx_scenarios_kind on public.scenarios (kind);
```

- Every existing row becomes a Patient Case through the default. Re-running the migration is safe.
- No other table changes:
  - `patient_id` is already nullable.
  - `offering_id` (070) holds the course.
  - `scenario_tasks.skill_id` and `scenario_task_steps.skill_step_id` (047) hold the skills and steps.
  - `scenario_assignments` holds the assignments, with `team_id` from 048.
  - `scenario_task_completions` and `scenario_task_step_ratings` hold the grades, with N/A from 071.
- A Return Demonstration row has:
  - `kind = 'return_demo'`
  - `patient_id = null`
  - `patient_case = {}`
  - `category = 'Return Demonstration'`. The column is NOT NULL and nothing reads it for this kind.
  - `difficulty = RETIRED_DIFFICULTY`
  - `is_ai_generated = false`
- Its tasks come from `addSkillTasks(supabase, id, selections)` in `lib/skill-tasks.ts`, the same path Patient Cases use. `seedScenarioTasks` (the default and auto tasks) is **never** called for a Return Demonstration. One with no skills can't be saved.

### Before 072 is live

- A new helper, `lib/scenario-kind.ts`, wraps the Patient Case filter. It tries the query with `kind = 'patient_case'`. On a missing column (`42703` / `PGRST204`, the same check as `isMissingActivityCourse`) it retries without the filter, because before 072 every scenario is a Patient Case. Patient Cases therefore keep working on a deploy that goes out before 072.
- The Return Demonstration routes return **503 "Return Demonstrations need database migration 072 applied first."** The page shows that message instead of the list.

## Instructor web: Teaching › Return Demonstrations

**Sidebar** (`faculty/layout-client.tsx`): `{ id: "return-demos", label: "Return Demonstrations", href: "/faculty/return-demos", icon: faHandHoldingMedical, section: "Teaching" }`, placed after Patient Cases. The Dean sidebar gets nothing, because Deans don't make Patient Cases either.

**List** (`/faculty/return-demos`):
- Cards are grouped by course and numbered within it, like Patient Cases.
- Each card shows:
  - the title
  - the skills, e.g. "1-1 Assessing Body Temperature · 1-2 …"
  - the number of students it's assigned to, and how many are graded
- Card actions:
  - **Assign**
  - **Grade**, which opens the review page filtered to this Return Demonstration
  - **Edit**
  - **Delete**
- Visibility follows `scenarioVisibleToFaculty`, as Patient Cases do.

**Create / Edit** (`/faculty/return-demos/new`, `/faculty/return-demos/[id]/edit`):
- One form. The fields are:
  - Title (required)
  - Course (required, `CoursePicker`)
  - Description (optional)
  - Skills (at least one), picked with the existing `skill-picker.tsx`
- Each picked skill can be expanded to read its steps.
- Editing can add or remove skills. Removing a skill that any student has already been graded on is refused with 409. This is a new rule: the Patient Case `api/faculty/scenarios/[id]/skills` DELETE removes the task and every grade on it, and stays that way.

**Assign** (a modal):
- It lists the instructor's groups and the students they supervise.
- A deadline is required (`parseDeadline`, entered in local time through `deadlineFromInput`).
- Required/Optional is a toggle.
- A group expands to its members, and each new assignment is tagged with that group's `team_id`.
- Students who already have it are skipped and counted in the result, e.g. "Assigned to 5; 2 already had it".

**Delete:**
- It is refused with 409 once any assignment has a graded task. This is new, and Patient Case delete is unchanged.
- Otherwise it deletes the row, and the assignments and tasks go with it by cascade.

**Grade** (`/faculty/return-demos/review`):
- This page reuses the Patient Case review page's components: the student queue, group filter, `AssignmentGrader`, `grading-table.tsx`, Finalize and grade-edit approval.
- The queue is read from `GET /api/faculty/scenarios/assignments?kind=return_demo`.
- The patient and brief panels are hidden when the assignment's scenario has no patient.
- The existing task, finalize and edit-request routes are unchanged, because they work on assignment ids.

**Routes:**
- `GET/POST /api/faculty/return-demos` lists and creates.
- `GET/PATCH/DELETE /api/faculty/return-demos/[id]` reads, edits (title, description, course, skills) and deletes.
- `POST /api/faculty/return-demos/[id]/assign` takes `{ team_ids, student_ids, deadline, required }`.
- Every one of these refuses a scenario whose kind isn't `return_demo`, and the Patient Case routes refuse one whose kind is `return_demo`. Each kind is handled only by its own routes.

## Patient Case readers: filter, keep or label

**Filter to `patient_case`** (through the `lib/scenario-kind.ts` helper):
- `GET /api/faculty/scenarios`: the Patient Cases list.
- `GET /api/faculty/scenarios/assignments`: the review queue. It defaults to `patient_case` and takes `?kind=return_demo`.
- `POST /api/faculty/teams/[id]/assign-cases`, and the case picker it lists from. A Return Demonstration can't be given as a group's case.
- `PATCH/DELETE /api/faculty/scenarios/[id]` and `…/[id]/assign` refuse `return_demo`.
- `GET /api/student/ward` and `lib/assigned-patients.ts` are patient-based, so a row with no patient already drops out. They are checked, not changed.
- `GET /api/faculty/courses/[id]/activities` is the pre-070 checklist link picker, and lists Patient Cases only.

**Keep both, with the kind exposed so callers can label or split:**
- `GET /api/student/scenarios` (mobile list and Home) adds `kind` per assignment.
- The task, finalize and edit-request routes, and `admin/grade-edit-requests`, are kind-agnostic.
- `lib/faculty-dashboard.ts` (Overview review queue and traces) labels each row with its noun and links a Return Demonstration row to `/faculty/return-demos/review`.
- `api/faculty/dashboard` stats still count both as "active" work.
- `api/student/tips`, `lib/reflections.ts`, `api/faculty/students/[id]/summary` and `ml/app/features.py` keep both. A graded skill counts toward competency and ML the same way whichever activity it came from.
- `lib/reports/*` give student reports their own "Return Demonstrations" heading, and attendance rows are labelled by kind.

During implementation, each file in the 2026-10-15 inventory (36 web files plus `ml/app/features.py`) is checked against this list. Any reader not named here gets a decision written into the plan.

## Student mobile (OTA)

- **Clinic tab:** a "Return Demonstrations" section after the patient cases. Each row shows the title, the skill count and names, the deadline, and a status: Upcoming, Overdue, Waiting for grade, or Graded with its score.
- **Detail screen** `app/retdem/[id].tsx`:
  - Each skill is shown with its goal and numbered steps, read from `GET /api/student/scenarios/[id]/tasks`, which already returns tasks and steps.
  - Before finalize it is read-only preparation.
  - After finalize each step shows its rating chip (Excellent / Satisfactory / Needs Practice / N/A) and the instructor's note, with the overall score at the top.
  - There is no "Ready to start?" prompt and no timer, and the Start route is never called for this kind.
- **Home:** the next-up list labels these "Return Demo" and opens the detail screen, not the ward.
- `mobile/lib/task-ratings.ts` already has the labels. The change ships with `npm run publish-update` after the web deploy. An older app shows a Return Demonstration as a patient case with no patient until it updates.

## Courses

- **Grading** (`lib/course-grading.ts`): `AUTO_PARTS` gains `{ id: 'return-demos', name: 'Return Demonstrations', type: 'return_demo' }` after Case Presentations.
- **Items** (`lib/courses.ts` `loadActivityItems`) read `kind` and file a `return_demo` scenario as `activity_type: 'return_demo'`, with `scenario_id` set. Before 072 every scenario is filed as `'scenario'`.
- **Scoring** (`course-progress.ts` `evaluate`) needs no new rule: an `activity` item with a `scenario_id` is already scored from the student's assignment. `ActivityType` gains `'return_demo'`, with `COUNT_NOUN`, `TOPIC`, `TOPIC_ORDER` and `topics.tsx` entries using the hand-holding icon and indigo accent.
- **The old `skill` topic** (pre-070 checklist items) is relabelled "Skills", with its blurb unchanged, so "Return Demonstrations" names one thing. The requirement modal's "Return Demonstration" label for that kind changes the same way.
- **The Skills tab:** a skill is covered when a Return Demonstration made for the course includes it. The coverage map reads the course's `return_demo` items and their skills, as well as legacy `skill` items. The copy changes to "Return Demonstrations made for this course cover these skills".
- **Students' missing items on mobile Home** (`studentChecklist`) name it "Return Demonstration #N".

## Attendance

- The stored kind stays `'scenario'` for both, because excuses (068) key on the assignment id and its check constraint lists only the three tables. `ActivityFact` gains `label_kind: 'patient_case' | 'return_demo'` for display.
- `ACTIVITY_KIND_LABEL` / `activityLabel` read "Patient Case · …" or "Return Demo · …". "RetDem" disappears from the attendance tab, the reports and the demo.
- Done-at is the same as a Patient Case: the first graded task.

## Demo mode

- New handlers cover:
  - `GET/POST /api/faculty/return-demos`
  - `GET/PATCH/DELETE /api/faculty/return-demos/[id]`
  - `POST …/assign`
  - `GET /api/faculty/scenarios/assignments?kind=`
- The demo store gets `kind` on scenarios, and the demo instructor gets two Return Demonstrations made for NCM 101:
  - "Vital Signs Return Demonstration" (Skills 1-1 temperature, 1-4 peripheral pulse, 1-6 respiration, 1-7 blood pressure), finalized for one group, with a few N/A steps
  - "Oxygen Therapy Return Demonstration" (Skills 14-1 pulse oximeter, 14-3 nasal cannula), upcoming
- `demoAttendanceRows` and the course fixtures pick them up.

## Out of scope

- **Notifications** on assign and grade. Patient Cases send none today, since only grade-edit requests notify. Adding them is a separate request.
- AI generation of Return Demonstrations.
- Hand-written or edited steps.
- A timer.
- Dean or super-admin pages.
- Copying a Return Demonstration between courses.

## Testing

- **`scripts/check-return-demos.ts`** (new, `check:return-demos`) checks:
  - The `autoSplit` part order and that Return Demonstrations get their own part.
  - `loadActivityItems` filing by kind, using a stubbed client.
  - Attendance labels and done-at.
  - Skills-tab coverage from `return_demo` items.
  - The kind-filter helper falling back on `42703`.
- **Existing checks updated:**
  - `check:grading` and `check:courses` for the new topic and the "Skills" relabel.
  - `check:attendance` for the labels.
  - `scripts/check-checklist-ratings.ts` stays green.
- **Migration:** 072 is applied twice against a local throwaway Postgres 18 cluster (per [[live-db-diverges-from-migrations]]) on top of a `scenarios` table shaped like the live one.
- **Build:** `npx tsc --noEmit`, then `NEXT_DIST_DIR=.next-build npm run build` beside the running dev server.
- **Visual check:** the puppeteer walk in demo mode covers the sidebar tab, list, create, assign, grade (N/A included), the course Grading part, the Skills tab and the student attendance tab. It asserts that zero `/api` requests reach the network.
- **Live:** after the user applies 072, save one Return Demonstration and assign it to one student. Confirm it does not appear in Patient Cases, the review queue or Assign case.

## Rollout

1. Commit in phases on main, committing only this work's own files by path, because other sessions share the index.
2. Deploy web. Patient Cases keep working before 072.
3. The user applies 072 in the Supabase SQL editor. Probe it with the REST OpenAPI schema (`scenarios.kind` present).
4. Run `npm run publish-update` for mobile.
