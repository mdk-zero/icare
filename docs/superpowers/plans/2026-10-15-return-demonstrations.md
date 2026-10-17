# Return Demonstrations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Return Demonstration activity. It is a Patient Case with no patient: one or more Taylor's skill checklists that students demonstrate and instructors grade step by step. It has its own Teaching tab, mobile screens, a course-grading part and attendance labels.

**Architecture:** Migration 072 adds `scenarios.kind` (`patient_case` | `return_demo`). A Return Demonstration is a `scenarios` row of kind `return_demo` with no patient. It reuses the existing tasks, steps, assignments, grading, finalize and edit-approval tables and routes. Patient Case readers filter by kind through `lib/scenario-kind.ts`, which treats every scenario as a Patient Case while 072 is missing.

**Tech Stack:** Next.js (App Router, `web/`), Supabase/PostgREST, Expo Router (`mobile/`, shipped over the air), tsx check scripts (this repo has no test runner).

**Spec:** `docs/superpowers/specs/2026-10-15-return-demonstrations-design.md`

## Global Constraints

- Kind values: `'patient_case'` (the default) and `'return_demo'`. A Return Demonstration row stores `category = 'Return Demonstration'`, `patient_id = null`, `patient_case = {}`, `difficulty = 'intermediate'` and `is_ai_generated = false`.
- Copy:
  - Sidebar item, list page title and course grading part: "Return Demonstrations".
  - A course item: "Return Demonstration #N".
  - Short label in attendance, mobile Home and the Overview: "Return Demo".
  - The Patient Case attendance label is "Patient Case" ("RetDem" is gone).
  - The pre-070 checklist `skill` topic is "Skills" for the section and "Skill" for one item.
- Rating scale is unchanged: Excellent 3 / Satisfactory 2 / Needs Practice 1 / N/A, with N/A out of the score. Don't touch `task-ratings.ts` scoring.
- Before 072, write routes answer 503 `Return Demonstrations need database migration 072 applied first.` and `GET /api/faculty/return-demos` answers 200 `{ return_demos: [], enabled: false }`.
- Every new or changed `/api` route the web calls gets a demo handler (Task 9). An unmocked route breaks "Try a demo".
- `web/AGENTS.md`: this Next.js has breaking changes, so read `node_modules/next/dist/docs/` for route handlers and dynamic params before writing a route. Copy the `params: Promise<{ id: string }>` pattern from existing routes.
- Mobile ships only through `npm run publish-update`. No new dependencies, and no edits to `app.json`, `eas.json` or `package.json`.
- Commits:
  - Commit directly on main with `git commit <paths>`, naming only this task's files. Other sessions share the index, so never use `git add -A` across the tree.
  - **No `Co-Authored-By` trailer.** This is the user's standing rule.
  - Never push.
- Gate before every commit:
  - `cd web && npx tsc --noEmit` passes.
  - The check scripts named in the task pass.
  - `NEXT_DIST_DIR=.next-build npm run build` succeeds. Use `.next-build` whenever `ss -ltnp | grep :3000` shows a dev server.
  - Mobile tasks also need `cd mobile && npx tsc --noEmit`.

## Review Focus

1. **A web deploy before 072 is applied.** Patient Cases list, review, Assign case and the student ward must behave exactly as today, and the Return Demonstrations tab must show the 072 message. Pinned in Task 1 (`scenarioKinds` falls back on `42703`/`PGRST204`).
2. **One student reached twice.** A student picked individually and also through a group, or one who already has the Return Demonstration, gets one assignment at most, and the skipped count says so. Pinned in Task 2 (`mergeAssignees`).
3. **Ungrouped section students.** Since df78076 these show on the instructor's group overview, but the roster refuses them (403), so the assign modal must not offer them. Pinned in Task 2 (`assignableStudents`).
4. **Removing a skill someone was graded on, or deleting a graded Return Demonstration.** Expect a 409 with the skill named, and nothing deleted. Pinned in Task 2 (`skillDiff` reports `blocked`).
5. **Assignment rows whose scenario was deleted, or whose kind can't be read.** They must stay Patient Cases, not vanish from both lists. Pinned in Task 1 (`ofKind` with an unknown id).

---

### Task 1: Migration 072 and the kind helpers

**Files:**
- Create: `web/supabase/migrations/072_scenario_kind.sql`
- Create: `web/app/lib/scenario-kind.ts`
- Create: `web/scripts/check-return-demos.ts`
- Modify: `web/package.json` (scripts: `"check:return-demos": "tsx scripts/check-return-demos.ts"`)

**Interfaces:**
- Produces (`scenario-kind.ts`, safe on the client: type-only Supabase import):
  - `type ScenarioKind = 'patient_case' | 'return_demo'`
  - `SCENARIO_KIND_NOUN: Record<ScenarioKind, string>` = `{ patient_case: 'Patient Case', return_demo: 'Return Demonstration' }`
  - `SCENARIO_KIND_SHORT: Record<ScenarioKind, string>` = `{ patient_case: 'Patient Case', return_demo: 'Return Demo' }`
  - `RETURN_DEMOS_NEED_MIGRATION` (the exact 503 string above)
  - `kindParam(value: string | null): ScenarioKind | 'all'`
  - `isMissingKindColumn(error: { code?: string } | null): boolean`
  - `scenarioKindsReady(supabase): Promise<boolean>`
  - `scenarioKinds(supabase, ids: readonly string[]): Promise<Map<string, ScenarioKind>>`
  - `kindOf(kinds: ReadonlyMap<string, ScenarioKind>, scenarioId: string): ScenarioKind`
  - `ofKind<T>(rows: readonly T[], kinds: ReadonlyMap<string, ScenarioKind>, kind: ScenarioKind | 'all', scenarioIdOf: (row: T) => string): T[]`
- Produces (check script): the `check`/`eq` helpers and a `stubClient(result)` Proxy. Every chained call returns the proxy and `then` resolves `result`, like `failingClient` in `lib/demo/handlers/faculty.ts`. Later tasks append sections to this file.

- [ ] **Step 1: Write the migration.** Use the SQL from the spec's "Data" section verbatim: column with default, `scenarios_kind_ck` (drop if exists, then add), `idx_scenarios_kind`. Add a header comment in the style of 071: what a Return Demonstration is, and that the column is additive and safe to re-run.

- [ ] **Step 2: Validate the migration on a throwaway Postgres 18.**
  - Run `initdb` into the job's tmp dir, then `pg_ctl` with `-o "-h 127.0.0.1 -p 55432 -c unix_socket_directories=''"`.
  - Create roles `anon`, `authenticated`, `service_role`.
  - Create a minimal `public.scenarios (id uuid primary key default gen_random_uuid(), title text not null)` with two rows.
  - Apply 072 **twice**.
  - Expected: both runs succeed; `select kind from public.scenarios` returns `patient_case` twice; `insert ... kind = 'quiz'` fails with `scenarios_kind_ck`.
  - Stop the cluster.

- [ ] **Step 3: Write the failing checks** in `check-return-demos.ts`, under a `// scenario-kind` heading:

```ts
eq('no kind param means Patient Cases', kindParam(null), 'patient_case');
eq('return_demo param', kindParam('return_demo'), 'return_demo');
eq('all param', kindParam('all'), 'all');
eq('an unknown param falls back to Patient Cases', kindParam('quiz'), 'patient_case');
const kinds = new Map<string, ScenarioKind>([['s1', 'patient_case'], ['s2', 'return_demo']]);
const rows = [{ id: 'a1', scenario_id: 's1' }, { id: 'a2', scenario_id: 's2' }, { id: 'a3', scenario_id: 's9' }];
eq('an unknown scenario reads as a Patient Case', kindOf(kinds, 's9'), 'patient_case');
eq('Patient Cases keep unknown ids', ofKind(rows, kinds, 'patient_case', (r) => r.scenario_id).map((r) => r.id), ['a1', 'a3']);
eq('Return Demos only', ofKind(rows, kinds, 'return_demo', (r) => r.scenario_id).map((r) => r.id), ['a2']);
eq('all keeps every row', ofKind(rows, kinds, 'all', (r) => r.scenario_id).length, 3);
const before072 = stubClient({ data: null, error: { code: '42703', message: 'column scenarios.kind does not exist' } });
eq('before 072 every scenario is a Patient Case', [...(await scenarioKinds(before072, ['s1', 's2'])).values()], ['patient_case', 'patient_case']);
check('scenarioKindsReady is false before 072', !(await scenarioKindsReady(before072)));
const after072 = stubClient({ data: [{ id: 's1', kind: 'patient_case' }, { id: 's2', kind: 'return_demo' }], error: null });
eq('after 072 kinds are read', Object.fromEntries(await scenarioKinds(after072, ['s1', 's2'])), { s1: 'patient_case', s2: 'return_demo' });
```

End the script with the usual `failures` summary and `process.exit(failures ? 1 : 0)`.

- [ ] **Step 4: Run it and confirm it fails.** Run `cd web && npm run check:return-demos`. Expected: it fails to import `../app/lib/scenario-kind`.

- [ ] **Step 5: Implement `scenario-kind.ts`.**
  - `scenarioKinds` reads `scenarios.select('id, kind').in('id', part)` in chunks of 300.
  - On `isMissingKindColumn`, it returns every id as `patient_case`. Any other error throws.
  - Ids missing from the result are left out of the map, and `kindOf` defaults them.
  - `scenarioKindsReady` probes `select('kind').limit(1)`, the same shape as `activityCoursesReady`.

- [ ] **Step 6: Run the checks.** Run `npm run check:return-demos`. Expected: all PASS, exit 0.

- [ ] **Step 7: Commit.** Run the gate, then `git commit web/supabase/migrations/072_scenario_kind.sql web/app/lib/scenario-kind.ts web/scripts/check-return-demos.ts web/package.json -m "feat(return-demos): migration 072 and the scenario kind helpers"`.

---

### Task 2: Return Demonstration rules (pure)

**Files:**
- Create: `web/app/lib/return-demos.ts` (pure: no server imports, so routes, pages and the demo share it)
- Modify: `web/scripts/check-return-demos.ts`

**Interfaces:**
- Consumes: `Parsed<T>` from `course-progress.ts`; `SkillSelection` (`{ skillId, sections? }`) and `parseSkillSelections` from `lib/skill-tasks.ts`. If importing `skill-tasks.ts` drags in server code, move `parseSkillSelections` and `SkillSelection` into this file and re-export them from `skill-tasks.ts`.
- Produces:
  - `RETURN_DEMO_CATEGORY = 'Return Demonstration'`
  - `MAX_RETURN_DEMO_TITLE = 200`
  - `interface ReturnDemoInput { title: string; description: string; offering_id: string | null; skills: SkillSelection[] }`
  - `parseReturnDemoInput(body: unknown, opts?: { partial?: boolean }): Parsed<Partial<ReturnDemoInput>>`
  - `mergeAssignees(input: { teamMembers: ReadonlyMap<string, readonly string[]>; studentIds: readonly string[]; teamOf: ReadonlyMap<string, string>; already: ReadonlySet<string> }): { rows: { student_id: string; team_id: string | null }[]; skipped: number }`
  - `skillDiff(current: readonly { id: string; skill_id: string | null; title: string }[], wanted: readonly SkillSelection[], graded: ReadonlySet<string>): { add: SkillSelection[]; remove: string[]; blocked: string[] }`
    - `remove` holds task ids.
    - `blocked` holds the titles of graded tasks that `wanted` drops. They are not in `remove`.
  - `assignableStudents(overview: Pick<TeamsOverview, 'viewer_id' | 'teams' | 'students'>): { teams: FacultyTeam[]; students: TeamsOverview['students'] }`
    - Returns only the viewer's own teams (`faculty_id === viewer_id`), and only students whose `team_id` is one of those teams.
    - Use type-only imports from `lib/api.ts`.

- [ ] **Step 1: Write the failing checks** under `// return-demo rules`:

```ts
eq('title is required', parseReturnDemoInput({ skills: ['1-1'] }), { ok: false, error: 'Title is required' });
eq('a skill is required', parseReturnDemoInput({ title: 'VS', skills: [] }), { ok: false, error: 'Pick at least one skill' });
eq('long titles refused', parseReturnDemoInput({ title: 'x'.repeat(201), skills: ['1-1'] }), { ok: false, error: 'Keep the title under 200 characters' });
const ok = parseReturnDemoInput({ title: '  Vital Signs ', skills: ['1-1', { id: '1-1' }, '1-4'], offering_id: 'o1' });
eq('title trimmed, skills de-duplicated in order', ok.ok && [ok.value.title, ok.value.skills!.map((s) => s.skillId)], ['Vital Signs', ['1-1', '1-4']]);
eq('a partial edit carries only what it names', parseReturnDemoInput({ description: 'x' }, { partial: true }), { ok: true, value: { description: 'x' } });
eq('a partial edit cannot empty the skills', parseReturnDemoInput({ skills: [] }, { partial: true }), { ok: false, error: 'Pick at least one skill' });

const merged = mergeAssignees({
  teamMembers: new Map([['t1', ['s1', 's2']]]),
  studentIds: ['s2', 's3', 's4'],
  teamOf: new Map([['s3', 't2']]),
  already: new Set(['s1']),
});
eq('group members tagged with the group, picks with their own group, nobody twice', merged.rows, [
  { student_id: 's2', team_id: 't1' }, { student_id: 's3', team_id: 't2' }, { student_id: 's4', team_id: null },
]);
eq('students who already have it are skipped once', merged.skipped, 1);

const diff = skillDiff(
  [{ id: 'k1', skill_id: '1-1', title: 'Assessing Body Temperature (Skill 1-1)' }, { id: 'k2', skill_id: '1-4', title: 'Pulse (Skill 1-4)' }, { id: 'k3', skill_id: '1-6', title: 'Respiration (Skill 1-6)' }],
  [{ skillId: '1-4' }, { skillId: '1-7' }],
  new Set(['k3']),
);
eq('adds new skills, removes ungraded dropped ones, blocks graded ones', diff, {
  add: [{ skillId: '1-7' }], remove: ['k1'], blocked: ['Respiration (Skill 1-6)'],
});

const overview = {
  viewer_id: 'f1',
  teams: [{ id: 't1', faculty_id: 'f1' }, { id: 't9', faculty_id: 'f2' }],
  students: [{ id: 's1', team_id: 't1' }, { id: 's2', team_id: null }, { id: 's3', team_id: 't9' }],
} as never;
eq('only own groups and their members are assignable', [assignableStudents(overview).teams.map((t) => t.id), assignableStudents(overview).students.map((s) => s.id)], [['t1'], ['s1']]);
```

- [ ] **Step 2: Run them and confirm they fail.** Run `npm run check:return-demos`. Expected: import error for `../app/lib/return-demos`.

- [ ] **Step 3: Implement `return-demos.ts`** with the signatures above.
  - Error strings exactly as tested.
  - `offering_id`: a non-empty trimmed string or `null`.
  - `description`: trimmed, defaulting to `''` on create.

- [ ] **Step 4: Run the checks.** Run `npm run check:return-demos`. Expected: all PASS.

- [ ] **Step 5: Commit.** Run the gate, then `git commit web/app/lib/return-demos.ts web/scripts/check-return-demos.ts -m "feat(return-demos): input, assignee and skill-edit rules"`.

---

### Task 3: Patient Case readers stay Patient Cases

**Files** (each modified file gets one `scenarioKinds` call and an `ofKind` or `kindOf` use):
- `web/app/api/faculty/scenarios/route.ts`: GET keeps `patient_case` only.
- `web/app/api/faculty/scenarios/assignments/route.ts`: filter by `kindParam(searchParams.get('kind'))`, and add `kind` to each row.
- `web/app/api/faculty/scenarios/[id]/route.ts`: PATCH and DELETE answer 404 `Patient case not found` for a `return_demo`.
- `web/app/api/faculty/scenarios/[id]/assign/route.ts` and `web/app/api/faculty/scenarios/[id]/skills/route.ts`: same 404.
- `web/app/api/faculty/teams/[id]/assign-cases/route.ts`: 404 `That case no longer exists` for a `return_demo`.
- `web/app/api/faculty/courses/[id]/activities/route.ts`: `patient_case` only.
- `web/app/api/student/ward/route.ts`: drop `return_demo` assignments before building the ward.
- `web/app/api/student/scenarios/route.ts`: add `kind` per assignment.
- `web/app/lib/api.ts`:
  - `ScenarioAssignment.kind?: ScenarioKind`
  - `fetchScenarioAssignments(scenarioId?: string, kind: ScenarioKind | 'all' = 'patient_case')`, which appends `kind=` to the URL
- Leave alone, already decided:
  - `assigned-patients.ts`: patient-based.
  - The tasks, finalize and edit-request routes, `admin/grade-edit-requests`: kind-agnostic.
  - `tips`, `reflections`, `students/[id]/summary`, `ml/app/features.py`: keep both kinds.
  - The faculty student profile's "Patient Cases" tab: it uses the default kind.

**Interfaces:**
- Consumes (Task 1): `scenarioKinds`, `ofKind`, `kindOf`, `kindParam`.
- Produces: `GET /api/faculty/scenarios/assignments?kind=patient_case|return_demo|all`. Each row carries `kind: ScenarioKind`.

- [ ] **Step 1: Add the check** under `// readers`: `eq('a kind map from before 072 keeps every assignment as a Patient Case', ofKind(rows, new Map(rows.map((r) => [r.scenario_id, 'patient_case' as const])), 'patient_case', (r) => r.scenario_id).length, 3);`. Run it. Expected: PASS, because the helper already exists. This pins the fallback contract the readers rely on.

- [ ] **Step 2: Apply the filters** listed under Files.

- [ ] **Step 3: Audit for missed readers.**
  - Run `cd web && grep -rlE "from\('scenarios'\)|from\(\"scenarios\"\)|scenario_assignments" app | grep -v /demo/ | sort`.
  - Expected: every file is either in the Files list above, in the "Leave alone" list, or one of the reporting, attendance, course, dashboard or teams readers that Tasks 7 and 8 own.
  - Any other file needs a decision added to this task before committing.

- [ ] **Step 4: Commit.** Run the gate, then `git commit` with each modified path, message `feat(return-demos): Patient Case screens read Patient Cases only`.

---

### Task 4: Return Demonstration API routes

**Files:**
- Create: `web/app/lib/return-demos-server.ts`
- Create: `web/app/api/faculty/return-demos/route.ts` (GET, POST)
- Create: `web/app/api/faculty/return-demos/[id]/route.ts` (GET, PATCH, DELETE)
- Create: `web/app/api/faculty/return-demos/[id]/assign/route.ts` (POST)

**Interfaces:**
- Consumes:
  - Task 1: `scenarioKindsReady`, `RETURN_DEMOS_NEED_MIGRATION`.
  - Task 2: `parseReturnDemoInput`, `mergeAssignees`, `skillDiff`, `RETURN_DEMO_CATEGORY`.
  - Existing: `activityCourse`, `parseOfferingId`, `addSkillTasks`, `getFacultyStudentIdSet`, `scenarioVisibleToFaculty`, `canFacultySeeScenario`, `manageableTeam`, `parseDeadline`, `logAudit`.
- Produces (`return-demos-server.ts`):
  - `loadReturnDemo(supabase, session, id): Promise<{ demo: { id: string; title: string; created_by: string | null; offering_id: string | null } } | { response: NextResponse }>`
    - Returns 404 `Return Demonstration not found` when the row is missing or not `return_demo`, and 403 when the viewer can't see it.
  - `gradedTaskIds(supabase, taskIds: string[]): Promise<Set<string>>`, the tasks with any `scenario_task_completions` row.
- Produces (HTTP, all `faculty` or `admin`):
  - `GET /api/faculty/return-demos` returns `{ return_demos: ReturnDemoSummary[], enabled: boolean }`, where:
    - `ReturnDemoSummary = { id, title, description, offering_id, created_by, created_at, skills: { id: string; title: string }[], student_count: number, graded_count: number }`
    - `skills` come from tasks in `sort_order`, with `id` = `skill_id` and `title` = the task title.
    - `graded_count` counts the viewer's students whose assignment is `completed`.
    - Visibility follows the `GET /api/faculty/scenarios` rules.
  - `POST /api/faculty/return-demos` takes `{ title, description?, offering_id, skills }` and returns 201 `{ return_demo: { id } }`.
    - It inserts the row with the Global Constraints values, then `addSkillTasks`. If that adds 0 tasks, delete the row and return 400 `None of those skills are in the catalog`.
    - `seedScenarioTasks` is never called.
  - `GET /api/faculty/return-demos/[id]` returns `{ return_demo: ReturnDemoSummary & { tasks: { id, skill_id, title, steps: number, graded: boolean }[] } }`.
  - `PATCH /api/faculty/return-demos/[id]` takes a partial input and returns `{ ok: true, added: number, removed: number }`.
    - If `blocked` is non-empty it returns 409 `Students have been graded on <titles joined with ", ">, so it can't be removed.` and changes nothing.
    - Only the creator, or an admin, may edit or delete.
  - `DELETE /api/faculty/return-demos/[id]` returns `{ success: true }`, or 409 `Students have been graded on this Return Demonstration, so it can't be deleted.`
  - `POST /api/faculty/return-demos/[id]/assign` takes `{ team_ids?: string[], student_ids?: string[], deadline, required? }` and returns 201 `{ assigned: number, skipped: number }`.
    - 400 `Choose at least one group or student`.
    - 403 `You can only assign your own groups` when a faculty member names a team they don't supervise (`teams.faculty_id`). An admin goes through `manageableTeam`.
    - 403 `Some students are not in your groups` when any resulting student isn't in `getFacultyStudentIdSet`.
    - 409 `Everyone chosen already has this Return Demonstration` when no rows remain.
- Every write answers 503 `RETURN_DEMOS_NEED_MIGRATION` when `!scenarioKindsReady`, and logs an audit row: `return_demo.create`, `.update`, `.delete` or `.assign`, entity type `scenarios`.

- [ ] **Step 1: Read `node_modules/next/dist/docs`** on route handlers. Confirm the `params: Promise<...>` shape matches `api/faculty/scenarios/[id]/route.ts`.
- [ ] **Step 2: Implement `return-demos-server.ts`** and the four handlers to the contract above.
  - Reading the team members for assign follows `teams/[id]/assign-cases`.
  - `teamOf` comes from `team_members` as in `scenarios/[id]/assign`.
- [ ] **Step 3: Add a contract check** under `// routes` in `check-return-demos.ts`. Read each route file's text with `readFileSync` and match `/export async function (GET|POST|PATCH|DELETE)\b/g`. Importing the modules would need server env. Expected PASS: `['GET','POST']`, `['GET','PATCH','DELETE']`, `['POST']`.
- [ ] **Step 4: Commit.** Run the gate, then `git commit` with the four new files and the check script, message `feat(return-demos): API for Return Demonstrations`.

---

### Task 5: Teaching › Return Demonstrations (list, form, assign)

**Files:**
- Modify: `web/app/faculty/layout-client.tsx`. Add the nav item `{ id: "return-demos", label: "Return Demonstrations", href: "/faculty/return-demos", icon: faHandHoldingMedical, section: "Teaching" }` directly after `scenarios`.
- Modify: `web/app/lib/api.ts`. Add `ReturnDemoSummary`, `ReturnDemoDetail`, `fetchReturnDemos`, `fetchReturnDemo`, `createReturnDemo`, `updateReturnDemo`, `deleteReturnDemo` and `assignReturnDemo`, mirroring Task 4's shapes. Writes return `{ error?: string }` alongside their data. Skills are sent as `{ id, sections? }[]`, the client `SkillSelection`.
- Modify: `web/app/faculty/scenarios/skill-picker.tsx`. Make `detectInput` optional; the "Detect skills" button renders only when it is given.
- Create: `web/app/faculty/return-demos/page.tsx` + `page-client.tsx` (the list)
- Create: `web/app/faculty/return-demos/return-demo-form.tsx` (shared by new and edit)
- Create: `web/app/faculty/return-demos/new/page.tsx` and `web/app/faculty/return-demos/[id]/edit/page.tsx`
- Create: `web/app/faculty/return-demos/assign-modal.tsx`
- Create: `web/app/faculty/return-demos/skill-steps-preview.tsx` (`fetchSkillDetails` for the picked ids; each skill is a collapsible list of its numbered steps)

**Interfaces:**
- Consumes:
  - Task 4 HTTP.
  - Task 2: `assignableStudents`.
  - Existing: `groupByCourse`, `numberWithinCourse` (`lib/course-groups.ts`), `CourseGroupHeading`, `CoursePicker` + `useActivityCourses` + `resolveCourse`, `PageHeader`, `Card`, `ActionsMenu`, `ConfirmModal`, `toast`, `usePageData`, `deadlineFromInput`, `fetchFacultyTeams`.
- Produces: the routes `/faculty/return-demos`, `/faculty/return-demos/new`, `/faculty/return-demos/[id]/edit`.
  - The card's Grade button links to `/faculty/return-demos/review?scenario=<id>`, which Task 6 builds.

- [ ] **Step 1: Build the list page.**
  - `usePageData("faculty:return-demos", …)` loads `fetchReturnDemos` and `fetchMyCourses`.
  - Cards are grouped and numbered by course, the way `faculty/scenarios/page-client.tsx` does it.
  - Each card shows title, skills ("1-1 · Assessing Body Temperature"), "N assigned · M graded", and the actions Assign, Grade, Edit and Delete.
  - Delete goes through `ConfirmModal`. A 409 error is shown as a toast.
  - When `enabled` is false, show only an amber panel with `RETURN_DEMOS_NEED_MIGRATION`.
  - Empty state: "No Return Demonstrations yet" with a New button.
- [ ] **Step 2: Build the form.**
  - Fields: Title, Course (`CoursePicker`, `what="return demonstration"`), Description, `SkillPicker` without `detectInput`, and `SkillStepsPreview` under it.
  - Save is disabled until there is a title, a resolved course (when the instructor has offerings) and at least one skill.
  - Edit loads `fetchReturnDemo` and seeds the picker from `tasks[].skill_id`, then saves through `updateReturnDemo` and shows a 409 as an inline error.
- [ ] **Step 3: Build the assign modal.**
  - Uses `fetchFacultyTeams()` → `assignableStudents`.
  - Shows groups as checkboxes, each expandable to its members, then individual students with a search box.
  - Deadline (`datetime-local` → `deadlineFromInput`) and Required are needed.
  - The toast reads "Assigned to N" or "Assigned to N; M already had it".
- [ ] **Step 4: Verify with the typecheck and the build.** Expected: the build route list contains `/faculty/return-demos`, `/faculty/return-demos/new` and `/faculty/return-demos/[id]/edit`.
- [ ] **Step 5: Commit** these files: `feat(return-demos): Teaching tab to make, list and assign Return Demonstrations`.

---

### Task 6: Grading Return Demonstrations on the review page

**Files:**
- Move the body of `web/app/faculty/scenarios/review/page-client.tsx` into `web/app/faculty/scenarios/review/review-workspace.tsx`, as `ReviewWorkspace({ kind }: { kind: ScenarioKind })`. `page-client.tsx` renders `<ReviewWorkspace kind="patient_case" />`.
- Create: `web/app/faculty/return-demos/review/page.tsx` (renders `<ReviewWorkspace kind="return_demo" />`)
- Modify: `web/app/faculty/scenarios/review/assignment-list.tsx`. The "All" filter title reads from the kind noun.

**Interfaces:**
- Consumes: `fetchScenarioAssignments(undefined, kind)` from Task 3, and `SCENARIO_KIND_NOUN`.
- Produces: `REVIEW_COPY: Record<ScenarioKind, { crumb: string; back: { label: string; href: string }; subtitle: string; empty: string; emptyBody: string; pick: string }>`, exported from `review-workspace.tsx`.
  - The `patient_case` entry is today's strings exactly.
  - The `return_demo` entry:
    - `crumb`: "Return Demonstrations"
    - `back`: `{ label: "Back to Return Demonstrations", href: "/faculty/return-demos" }`
    - `subtitle`: "Rate each step of a student's Return Demonstration on a verbal scale, add notes where it helps, then save the grade — you can edit it later."
    - `empty`: "No Return Demonstrations yet"
    - `emptyBody`: "Assigned Return Demonstrations show up here."
    - `pick`: "Choose a Return Demonstration from the list to rate each step and lock in a grade."
- Behaviour:
  - The `usePageData` key is `faculty:scenario-review:${kind}`.
  - `?scenario=<id>` (read with `useSearchParams`) narrows the queue to that scenario. A chip names it and has an × that clears the param with `history.replaceState`, the courses tab pattern.

- [ ] **Step 1: Extract `ReviewWorkspace`.** The Patient Case page must render unchanged: the same strings, and `fetchScenarioAssignments` with the default kind.
- [ ] **Step 2: Add the Return Demonstration page** and the `?scenario=` narrowing.
- [ ] **Step 3: Verify with the typecheck and the build.** Expected: the route `/faculty/return-demos/review` is listed.
- [ ] **Step 4: Commit:** `feat(return-demos): grade Return Demonstrations on the checklist`.

---

### Task 7: Courses — its own grading part and skill coverage

**Files:**
- Modify: `web/app/lib/course-progress.ts`
  - `ActivityType` gains `'return_demo'`.
  - `COUNT_NOUN.return_demo = ['Return Demonstration', 'Return Demonstrations']`.
  - `TOPIC_ORDER` = `['scenario', 'assessment', 'exam', 'case_presentation', 'return_demo', 'skill', 'manual', 'shift']`.
  - `TOPIC.return_demo = 'Return Demonstration'` and `TOPIC.skill = 'Skill'`.
  - New `skillCoverage(...)` (below).
- Modify: `web/app/lib/course-grading.ts`. `AUTO_PARTS` gains `{ id: 'return-demos', name: 'Return Demonstrations', type: 'return_demo' }` last.
- Modify: `web/app/lib/courses.ts`
  - `loadActivityItems` reads `scenarios.select('id, offering_id, created_at, kind')`, retrying without `kind` on `isMissingKindColumn`. A `return_demo` row becomes `activity_type: 'return_demo'` with `scenario_id` set, and items are ordered Patient Cases, Return Demonstrations, Quizzes, Case Presentations.
  - `labelRequirements` adds `skill_ids: string[]` to `return_demo` items, from their `scenario_tasks.skill_id` in sort order. It is `[]` on every other item.
- Modify: `web/app/lib/course-requirements.ts`. `wantsCases` is true for `activity_type` `'scenario'` **or** `'return_demo'`.
- Modify: `web/app/lib/api.ts`. `CourseRequirement.skill_ids?: string[]`.
- Modify: `web/app/faculty/courses/topics.tsx`
  - New `return_demo` entry: "Return Demonstrations", `faHandHoldingMedical`, indigo, blurb "Met by graded Return Demonstrations".
  - `skill` becomes "Skills" with the `faClipboardCheck` icon. Its colours and blurb stay as they are: since 070 its items never show beside Return Demonstrations, so the shared indigo can't be confused.
- Modify: `web/app/faculty/courses/[id]/requirement-modal.tsx`. The `skill` label becomes "Skill".
- Modify: `web/app/faculty/courses/[id]/skills-tab.tsx`
  - Coverage comes from `skillCoverage(requirements)`.
  - The topic style is `TOPICS.return_demo`.
  - The share line reads "Shared with your Dean and every instructor teaching {courseCode}; Return Demonstrations made for this course cover these skills."
- Modify: `web/app/lib/demo/handlers/courses.ts`. `checklist()` files `s.kind === 'return_demo'` scenarios as `'return_demo'`.
- Modify: `web/app/lib/demo/fixtures/courses.ts`. The component "Return demonstrations" becomes "Skill check-offs".
- Modify: `web/scripts/check-course-grading.ts` and `web/scripts/check-course-progress.ts`. Rename the expectations that pin the old wording, as the steps below describe.

**Interfaces:**
- Produces: `skillCoverage(requirements: readonly (TopicFields & { id: string; skill_id: string | null; skill_ids?: readonly string[] })[]): Map<string, { id: string; name: string }[]>`.
  - `name` is from `requirementNames` over the same list.
  - A `skill` item covers its `skill_id`.
  - A `return_demo` item covers every id in `skill_ids`.

- [ ] **Step 1: Write the failing checks** under `// courses` in `check-return-demos.ts`:

```ts
eq('Return Demonstrations are their own automatic part, last',
  autoSplit([{ id: 'c1', activity_type: 'scenario' }, { id: 'r1', activity_type: 'return_demo' }, { id: 'q1', activity_type: 'assessment' }]).parts.map((p) => [p.name, p.items]),
  [['Patient Cases', ['c1']], ['Quizzes', ['q1']], ['Case Presentations', []], ['Return Demonstrations', ['r1']]]);
eq('items are named Return Demonstration #N', requirementNames([{ kind: 'activity', activity_type: 'return_demo' }, { kind: 'activity', activity_type: 'return_demo' }]), ['Return Demonstration #1', 'Return Demonstration #2']);
eq('old skill items are Skills now', requirementNames([{ kind: 'skill', activity_type: null }]), ['Skill #1']);
const cov = skillCoverage([
  { id: 'r1', kind: 'activity', activity_type: 'return_demo', skill_id: null, skill_ids: ['1-1', '1-4'] },
  { id: 'k1', kind: 'skill', activity_type: null, skill_id: '1-4' },
]);
eq('a Return Demonstration covers each of its skills', cov.get('1-1'), [{ id: 'r1', name: 'Return Demonstration #1' }]);
eq('coverage merges both kinds of item', cov.get('1-4')!.map((c) => c.id), ['r1', 'k1']);
const items = await loadActivityItems(tableStub({
  scenarios: { data: [{ id: 'c1', offering_id: 'o1', created_at: '2026-10-01', kind: 'patient_case' }, { id: 'r1', offering_id: 'o1', created_at: '2026-10-02', kind: 'return_demo' }], error: null },
  assessments: { data: [], error: null }, case_presentations: { data: [], error: null },
}), ['o1']);
eq('loadActivityItems files by kind', items!.map((i) => [i.id, i.activity_type, i.scenario_id]), [['c1', 'scenario', 'c1'], ['r1', 'return_demo', 'r1']]);
```

  Add `tableStub(byTable)` next to `stubClient`. It is the same Proxy, but `from(table)` picks the result for that table.

- [ ] **Step 2: Run them and confirm they fail.** Run `npm run check:return-demos`. Expected: FAIL on the `autoSplit` part list and on `skillCoverage` not being exported.
- [ ] **Step 3: Implement** the changes listed under Files.
  - The typecheck will flag every exhaustive `Record<ActivityType, …>` and `switch`; give each a `return_demo` arm.
  - In a `count` switch, `return_demo` reads `own.cases` like `scenario`.
  - In `check-course-grading.ts`, the two "Return demonstrations" expectations become "a demo component is named Skill check-offs" and "…and holds only skill items".
  - In `check-course-progress.ts`, update any expectation pinning `'Return Demonstration'` as the `skill` topic to `'Skill'`.
- [ ] **Step 4: Run the checks.** Run `npm run check:return-demos && npm run check:grading && npm run check:courses`. Expected: all pass.
- [ ] **Step 5: Commit:** `feat(courses): Return Demonstrations are a grading part and cover course skills`.

---

### Task 8: Attendance, Overview and reports say which kind it is

**Files:**
- Modify: `web/app/lib/attendance.ts`
  - `ActivitySources.scenarioAssignments[]` gains `kind?: ScenarioKind`.
  - `ActivityFact` and `ActivityGroup` gain `scenario_kind?: ScenarioKind`, set only on `kind: 'scenario'` rows (default `patient_case`).
  - New `activityKindLabel(fact: Pick<ActivityFact, 'kind' | 'scenario_kind'>): string`.
  - `activityLabel(kind: ActivityKind, title: string, scenarioKind?: ScenarioKind)`.
  - `ACTIVITY_KIND_LABEL.scenario` becomes `'Patient Case'`.
  - The stored `kind` stays `'scenario'`, so excuses (068) are unchanged.
- Modify: `web/app/lib/activity-attendance.ts`. Select `scenarios(title, kind)` and fall back to `scenarios(title)` on `isMissingKindColumn`. Default `title` is `'Return Demonstration'` or `'Patient case'` by kind.
- Modify: `web/app/faculty/students/[id]/attendance-tab.tsx`
  - The row label comes from `activityKindLabel`.
  - A Return Demo uses the `faHandHoldingMedical` icon.
  - Hint strings change from "RetDems, quizzes, case presentations" to "Patient cases, return demos, quizzes, case presentations". This also applies at `students/[id]/page-client.tsx:748`.
- Modify: `web/app/lib/reports/builders.tsx` and `web/app/lib/demo/reports.tsx`. Pass `a.scenario_kind` to `activityLabel`.
- Modify: `web/app/lib/reports/builders.tsx`, the student report.
  - Read each assignment's kind (via `scenarioKinds`) and split `scenarioRows`.
  - The "Patient Cases" table, and "Patient case average", keep `patient_case`.
  - A new "Return Demonstrations" section has head `['Return Demonstration', 'Status', 'Graded', 'Grade']` and empty text "No return demonstrations assigned yet.", placed after Patient Cases.
- Modify: `web/app/lib/reports/data.ts`. `studentWork` counts `patient_case` only for `scenariosAssigned`, `scenariosGraded` and `scenarioAverage`, by reading kinds with `scenarioKinds`.
- Modify: `web/app/lib/faculty-dashboard.ts` and `web/app/faculty/_overview/WaitingCard.tsx`. `DueItem.kind` gains `'return_demo'`, set from `kindOf`, and shows the `faHandHoldingMedical` icon.
  - The review queue (`ReviewItem`) is left alone. It lists only handed-in work (`submitted_at`), and Return Demonstrations are never handed in. This replaces the spec's "links a Return Demonstration row to its review page".
- Modify: `web/app/lib/demo/handlers/derive.ts`. `demoAttendanceRows` passes `kind` from the demo scenario.
- Modify: `web/scripts/check-attendance.ts`, lines 178–180.

**Interfaces:**
- Consumes: Task 1 helpers.
- Produces: `activityKindLabel`, the extended `activityLabel`, and `ActivityFact.scenario_kind`.

- [ ] **Step 1: Write the failing checks** in `check-attendance.ts`. Replace `eq('a RetDem row', activityLabel('scenario', 'Asthma'), 'RetDem · Asthma')` with:

```ts
eq('a Patient Case row', activityLabel('scenario', 'Asthma'), 'Patient Case · Asthma');
eq('a Return Demo row', activityLabel('scenario', 'Vital Signs', 'return_demo'), 'Return Demo · Vital Signs');
const rd = collectActivities({ scenarioAssignments: [{ id: 'ra', student_id: 'u', scenario_id: 'r1', title: 'VS', deadline: '2026-10-10T00:00:00Z', kind: 'return_demo' }], completions: [{ assignment_id: 'ra', completed_at: '2026-10-09T00:00:00Z' }], quizAssignments: [], attempts: [], caseSubmissions: [] });
eq('a Return Demo is done at its first graded step, stored as a scenario', [rd[0].kind, rd[0].scenario_kind, rd[0].done_at], ['scenario', 'return_demo', '2026-10-09T00:00:00Z']);
```

- [ ] **Step 2: Run them and confirm they fail.** Run `npm run check:attendance`. Expected: FAIL on the `'Patient Case · Asthma'` row.
- [ ] **Step 3: Implement** the changes listed under Files.
- [ ] **Step 4: Run the checks.** Run `npm run check:attendance && npm run check:return-demos`. Expected: all pass.
- [ ] **Step 5: Commit:** `feat(return-demos): attendance, Overview and reports name the kind`.

---

### Task 9: Demo mode

**Files:**
- Modify: `web/app/lib/demo/fixtures/school.ts`. `DemoScenario.kind?: ScenarioKind`.
- Create: `web/app/lib/demo/fixtures/return-demos.ts`, `seedReturnDemos(...)`, called from `fixtures/index.ts`. For the demo instructor, on the NCM 101 offering, it adds:
  - "Vital Signs Return Demonstration": Skills 1-1, 1-4, 1-6, 1-7. Assigned to the instructor's first group with a deadline 3 days ago, and finalized for every member. Each member has a few `not_applicable` step ratings and a stored score.
  - "Oxygen Therapy Return Demonstration": Skills 14-1, 14-3. Assigned to the same group, due in 4 days, pending.
  - Build tasks and steps with `skillTaskFields`, `stepsForSections` and `stepSource`, as `addSkillTasks` does in `handlers/faculty.ts`.
- Create: `web/app/lib/demo/handlers/return-demos.ts`, registered where the other handler modules are imported. It mirrors Task 4's routes and shapes on the demo store.
  - It reuses `addSkillTasks`, `canSeeScenario`, `myStudentIds`, `newAssignment` and `assignmentRow` from `handlers/faculty.ts`; export them if they're private.
- Modify: `web/app/lib/demo/handlers/faculty.ts`
  - `GET /api/faculty/scenarios` filters `kind !== 'return_demo'`.
  - `GET /api/faculty/scenarios/assignments` honours `kind` with `kindParam`.
  - `assignmentRow` adds `kind`.
- Modify: `web/scripts/check-return-demos.ts`

**Interfaces:**
- Consumes: Task 2 rules and Task 4 response shapes.

- [ ] **Step 1: Write the failing checks** under `// demo`:

```ts
const db = seed();
const rds = db.scenarios.filter((s) => s.kind === 'return_demo');
eq('the demo has two Return Demonstrations', rds.map((s) => s.title).sort(), ['Oxygen Therapy Return Demonstration', 'Vital Signs Return Demonstration']);
check('neither has a patient', rds.every((s) => s.patient_id === null));
check('the graded one has N/A steps', db.stepRatings.some((r) => r.rating === 'not_applicable' && db.assignments.find((a) => a.id === r.assignment_id)?.scenario_id === rds.find((s) => s.title.startsWith('Vital'))!.id));
```

- [ ] **Step 2: Run them and confirm they fail.** Run `npm run check:return-demos`. Expected: FAIL, because the demo has no Return Demonstrations yet.
- [ ] **Step 3: Implement** the fixtures and handlers.
- [ ] **Step 4: Run the checks.** Run `npm run check:return-demos && npm run check:attendance && npm run check:grading`. Expected: all pass. `check:grading` still counts three demo splits.
- [ ] **Step 5: Walk the demo.**
  - Use the puppeteer-core + system Firefox walk from memory `visual-check-without-live-writes`: click "Try a demo" → Instructor.
  - Visit `/faculty/return-demos`, create one, assign it, open `/faculty/return-demos/review` and rate one step N/A.
  - Visit the NCM 101 course Grading and Skills tabs and a group member's Attendance tab.
  - Expected:
    - zero `/api` requests reach the network
    - no `[demo] unmocked` warnings
    - a "Return Demonstrations" part on Grading
    - "Return Demo · Vital Signs Return Demonstration" on Attendance
  - Save screenshots to the job tmp dir.
- [ ] **Step 6: Commit:** `feat(demo): Return Demonstrations in the demo`.

---

### Task 10: Student mobile

**Files:**
- Modify: `mobile/lib/api.ts`. `ScenarioAssignment.kind?: 'patient_case' | 'return_demo'`, plus `isReturnDemo(a: Pick<ScenarioAssignment, 'kind'>): boolean`.
- Create: `mobile/app/retdem/[id].tsx`. The id is the assignment id.
- Modify: `mobile/app/_layout.tsx`. Add `<Stack.Screen name="retdem/[id]" options={{ title: 'Return Demonstration' }} />`.
- Modify: `mobile/app/(tabs)/clinic.tsx`. Add a "Return Demonstrations" section after the patient cases, from `fetchScenarioAssignments()` filtered with `isReturnDemo`.
- Modify: `mobile/app/(tabs)/index.tsx`
  - `openAssignment` sends a Return Demo to `/retdem/${a.id}`.
  - Next-up rows for one show a "Return Demo" badge.

**Interfaces:**
- Consumes:
  - `fetchScenarioAssignments`, `fetchScenarioTasks(assignmentId)` (tasks carry steps and, once graded, ratings and notes).
  - `ClinicalTaskList`, `ClinicalTaskListSkeleton`, `ScoreRing`, `Card`, `Badge`, `EmptyState`, `useApiData`/`allCached`.
  - Task 3's `kind` on `/api/student/scenarios`.
- Behaviour:
  - Status chip:
    - **Graded** with the score when `status === 'completed'`
    - **Overdue** when the deadline is past
    - **Waiting for grade** when any step is rated but the assignment isn't finalized
    - otherwise **Upcoming**
  - The screen never calls `startScenarioAssignment` or `useCaseClock`.
  - While the screen is open and not completed, it polls every 8 s like `clinic/assignment/[id].tsx`.
  - The Clinic section hides itself when there are none.

- [ ] **Step 1: Implement the four changes**, copying `clinic/assignment/[id].tsx`'s structure minus the patient brief, the clock and the reflection card.
- [ ] **Step 2: Typecheck.** Run `cd mobile && npx tsc --noEmit`. Expected: no errors.
- [ ] **Step 3: Lint.** Run `cd mobile && npm run lint`. Expected: no new errors in the touched files.
- [ ] **Step 4: Commit:** `feat(mobile): students see their Return Demonstrations`. Do **not** run `publish-update`; the user publishes after the web deploy.

---

### Task 11: Final verification and handoff

**Files:**
- Modify: `/home/mdk0/.claude/projects/-home-mdk0-Projects-icare/memory/return-demonstrations.md` and `live-migration-status.md` (072 written, NOT live)

- [ ] **Step 1: Run every check script.** Run `cd web && npm run check:return-demos && npm run check:attendance && npm run check:grading && npm run check:courses && npx tsx scripts/check-checklist-ratings.ts`. Expected: all pass. `check-case-logic.ts` has 3 stale failures already, so don't use it as a gate.
- [ ] **Step 2: Build.** Run `NEXT_DIST_DIR=.next-build npm run build` and `cd mobile && npx tsc --noEmit`. Expected: both green.
- [ ] **Step 3: Request the whole-branch review**, from `ca02c58..HEAD`, before reporting done.
- [ ] **Step 4: Update memory**, recording:
  - the shipped commits
  - that 072 is not live
  - the user's next steps: deploy web, apply 072 in the Supabase SQL editor, probe `scenarios.kind` through the REST OpenAPI schema, save one Return Demonstration live, then `cd mobile && npm run publish-update`
