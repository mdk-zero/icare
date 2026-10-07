# Course Grading Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instructors divide a course's grade into weighted parts and components (for example, Written Exams 30 / Laboratory & Skills 70, each split further), file checklist items under them, and see a weighted "so far" grade per student. Paper exams become their own Written Exam kind.

**Architecture:** The split is one JSON document on `course_offerings.grading` (migration 067), validated and evaluated by a new pure module, `web/app/lib/course-grading.ts`, which the API routes, the client and the in-browser demo all share. Grades are never stored. They are computed from the `ItemProgress` that `evaluate()` already produces, so a regrade or an entered score changes the grade at once.

**Tech Stack:** Next.js (App Router; read `web/node_modules/next/dist/docs/` before writing route or page code, per `web/AGENTS.md`), TypeScript, supabase-js with the service role, Tailwind, FontAwesome. The repo has no test runner: behaviour checks are `tsx` scripts that exit non-zero on failure.

**Spec:** `docs/superpowers/specs/2026-10-06-course-grading-split-design.md`

**One refinement of the spec:** the progress GET returns `grading`, and the Progress tab computes grades in the browser with the same `computeGrades()`. That way a score entered in a cell updates the Grade column straight away, because the tab patches cells locally with `setData`. The GET does not send a `grades` field.

## Global Constraints

- Weights are percents of the final grade at both levels. Parts sum to 100, and a part's components sum to that part's weight, each within ±0.01. Weights are rounded to 2 decimals.
- Limits: at most 10 parts, at most 10 components per part, and names of 1–60 characters (trimmed), unique among siblings ignoring case.
- Items sit only on leaves, meaning a component or a part with no components, and each item at most once. Shift counts (attendance) can never be filed.
- A component's score is the plain mean of its scored items. Unscored work is left out, and rescaling happens per level (component within part, then part within the whole).
- Item score: `avg_score` for count items, `best_score` for activity, skill and manual items, none for shift counts.
- Grades are shown as a percent with 1 decimal at most (`formatGrade`). There is no transmutation and no pass/fail.
- UI words: "Grading" (tab), "Written Exam" / "Written Exams" (kind and section), "Counts toward", "Not counted in the grade", "so far".
- Lock: the term has ended → the grading PUT returns 409 with `GRADING_ENDED_LOCK = 'This term has ended, so its grading split is locked. Scores can still be changed.'`
- Before 067 is live: `GRADING_NEEDS_MIGRATION = 'The grading split needs database migration 067 (course grading) applied first.'` and `EXAMS_NEED_MIGRATION = 'Written Exams need database migration 067 (course grading) applied first.'`. Every other course page behaves exactly as today.
- Commits go directly on main, by path. New files are `git add <file>`-ed first, then `git commit <paths…>`; never commit the whole index (other sessions stage there). No push, and no Co-Authored-By trailer.
- Typecheck: `cd web && npx tsc --noEmit`. Build beside a running dev server: `cd web && NEXT_DIST_DIR=.next-build npm run build`.

## Review Focus

1. **Thirds:** weights like 33.33 / 33.33 / 33.34 must save. Float sums are compared within ±0.01. (Test in Task 2.)
2. **Stale Grading-tab draft:** an instructor with unsaved Grading edits files an item from the modal, then saves the tab. The save must not silently unfile that item. The PUT carries `base` (`gradingSignature` of the split the draft started from) and returns 409 when the stored split differs. (Tests in Task 2 for the signature, Task 5 for the 409.)
3. **No work is not zero:** a count item with `avg_score: null`, or a skill with no evidence, is unscored and left out. It must not count as 0. (Test in Task 2.)
4. **An item that turns into attendance while filed:** a PATCH that makes an item a shift count unfiles it, and `computeGrades` ignores any shift count still filed. (Tests in Task 2; route in Task 5.)
5. **Saved demo stores from before this change:** requirements without `manual_type` read as Lab Activities, and offerings without `grading` show the Grading empty state. Nothing should crash. (Step in Task 9.)

---

## Phase 1: Pure logic

### Task 1: Written Exam kind in `course-progress.ts`

**Files:**
- Modify: `web/app/lib/course-progress.ts` (RequirementRow ~115, parseRequirement ~233, topic block ~368–410, offeringSummary comment ~738)
- Modify: `web/scripts/check-course-progress.ts` (the `blank` builder gets `manual_type: 'lab'`, plus the new checks)
- Modify: whatever `tsc` flags for the new required field. Expected: `web/app/lib/demo/fixtures/courses.ts` (`blank`) and `web/scripts/seed-courses.ts` if it builds `RequirementRow`s.

**Interfaces:**
- Produces:
  - `export type ManualType = 'lab' | 'exam'`
  - `RequirementRow.manual_type: ManualType`
  - `RequirementTopicKey = ActivityType | 'skill' | 'manual' | 'exam'`
  - `export type TopicFields = Pick<RequirementRow, 'kind' | 'activity_type'> & Partial<Pick<RequirementRow, 'manual_type'>>`, now the parameter type of `topicKey`, `requirementTopic`, `inTopicOrder` and `requirementNames`
  - `TOPIC_ORDER = ['scenario','assessment','exam','case_presentation','skill','manual','shift']`
  - `TOPIC.exam = 'Written Exam'`

- [ ] **Step 1: Add the failing checks to `scripts/check-course-progress.ts`**

```ts
console.log('Written Exams');
const exam = req({ kind: 'manual', title: 'Midterm exam', manual_type: 'exam' });
const lab = req({ kind: 'manual', title: 'Return demo' });
const quizCount = req({ kind: 'count', activity_type: 'assessment', target_count: 2 });
eq('exam topic', topicKey(exam), 'exam');
eq('manual without manual_type is a Lab Activity', topicKey({ kind: 'manual', activity_type: null }), 'manual');
eq('exam names', requirementNames([exam, lab, req({ kind: 'manual', title: 'Final', manual_type: 'exam' })]),
  ['Written Exam #1', 'Lab Activity #1', 'Written Exam #2']);
eq('exams sit after Quizzes', inTopicOrder([lab, exam, quizCount]).map((r) => r.id), [quizCount.id, exam.id, lab.id]);
const parsedExam = parseRequirement({ kind: 'manual', title: 'Midterm', manual_type: 'exam' });
eq('parse keeps exam', parsedExam.ok && parsedExam.value.manual_type, 'exam');
const parsedSkill = parseRequirement({ kind: 'skill', skill_id: '1-1', manual_type: 'exam' });
eq('non-manual forced to lab', parsedSkill.ok && parsedSkill.value.manual_type, 'lab');
const parsedBad = parseRequirement({ kind: 'manual', title: 'x', manual_type: 'quiz' });
eq('bad manual_type', parsedBad.ok ? null : parsedBad.error, 'Choose Lab Activity or Written Exam');
```

Import `topicKey` alongside the existing imports.

- [ ] **Step 2: Run the checks and confirm they fail**

Run: `cd web && npx tsx scripts/check-course-progress.ts`
Expected: a non-zero exit, with FAIL on the new lines (or a type error on `manual_type`).

- [ ] **Step 3: Implement the interfaces above in `course-progress.ts`**

- `topicKey` returns `'exam'` when `kind === 'manual' && manual_type === 'exam'`.
- `parseRequirement`: `base.manual_type = 'lab'`. For manual items, an absent `manual_type` means `'lab'`, `'exam'` is kept, and any other value returns `'Choose Lab Activity or Written Exam'`.
- Update the `offeringSummary` doc comment: "Lab Activities and Written Exams (manual items) still waiting for a score". The logic is unchanged.
- Fix every `tsc` error from the new required field by adding `manual_type: 'lab'` to the row builders.

- [ ] **Step 4: Run the checks and typecheck**

Run: `cd web && npx tsx scripts/check-course-progress.ts && npx tsc --noEmit`
Expected: all PASS, exit 0, and no type errors.

- [ ] **Step 5: Commit**

```bash
git commit web/app/lib/course-progress.ts web/scripts/check-course-progress.ts <files tsc made you touch> -m "feat(courses): a Written Exam kind of hand-scored item"
```

### Task 2: `course-grading.ts`, the grading split's rules and math

**Files:**
- Create: `web/app/lib/course-grading.ts` (pure: imports only from `./course-progress`)
- Create: `web/scripts/check-course-grading.ts` (same `check`/`eq` harness and `req()` builder as `check-course-progress.ts`)
- Modify: `web/package.json` (add the script `"check:grading": "tsx scripts/check-course-grading.ts"` after `check:courses`)

**Interfaces:**
- Consumes: `RequirementRow`, `ItemProgress`, `Parsed`, `entryMode` from `course-progress.ts`.
- Produces:

```ts
export interface GradeComponent { id: string; name: string; weight: number; items: string[] }
export interface GradePart extends GradeComponent { components: GradeComponent[] }
export interface GradingSplit { parts: GradePart[] }
export interface StudentGrade {
  grade: number | null;
  /** Sum of the weights of leaves with a score: "85% of the grade scored so far". */
  scored_weight: number;
  parts: Record<string, number | null>;
  components: Record<string, number | null>;
}
export interface GradeResult { invalid: boolean; grades: Record<string, StudentGrade> }
export const GRADING_LIMITS = { parts: 10, components: 10, name: 60 } as const;
export const GRADING_ENDED_LOCK: string;      // copy in Global Constraints
export const GRADING_NEEDS_MIGRATION: string; // copy in Global Constraints
export const EXAMS_NEED_MIGRATION: string;    // copy in Global Constraints
export function isGradeable(req: Pick<RequirementRow, 'kind' | 'activity_type'>): boolean; // false only for shift counts
export function itemScore(req: RequirementRow, item: ItemProgress | undefined): number | null;
export function splitProblem(split: GradingSplit): string | null;  // limits, names, weights, sums, leaf-only, duplicates
export function parseGrading(body: unknown, requirements: readonly RequirementRow[]): Parsed<GradingSplit | null>;
export function readStoredSplit(value: unknown): GradingSplit | null; // structural shape only; sums are not checked
export function computeGrades(split: GradingSplit | null, requirements: readonly RequirementRow[],
  progress: Record<string, Record<string, ItemProgress>>): GradeResult;
export function gradingLeaves(split: GradingSplit | null): { id: string; label: string }[]; // "Written Exams › Midterm"
export function leafOf(split: GradingSplit | null, requirementId: string): string | null;
export function gradeLeafProblem(split: GradingSplit | null, leafId: string): string | null;
export function fileItem(split: GradingSplit, requirementId: string, leafId: string | null): GradingSplit;
export function refile(split: GradingSplit, req: RequirementRow, leafId: string | null | undefined): GradingSplit;
export function addComponent(split: GradingSplit, partId: string, component: GradeComponent): GradingSplit;
export function presetSplit(newId: () => string): GradingSplit; // Written Exams 30 / Laboratory & Skills 70, no components
export function gradingSignature(split: GradingSplit | null): string; // canonical: sorted keys; 'null' for null
export function formatGrade(n: number): string; // 82.3456 → "82.3%", 100 → "100%"
```

Exact messages, which are UI copy:

| Condition | Message |
|---|---|
| `parseGrading` body not an object, or `parts` not an array, or an id that is not a non-empty string of at most 64 characters | `Invalid grading split` |
| more than 10 parts | `A split can have at most 10 parts` |
| more than 10 components in a part | `"<part>" can have at most 10 components` |
| blank name | `Every part and component needs a name` |
| name too long | `Names can be at most 60 characters` |
| two parts share a name | `Two parts are both called "<name>"` |
| two components in one part share a name | `Two components in "<part>" are both called "<name>"` |
| weight missing or ≤ 0 or > 100 | `"<name>" needs a percent above 0` |
| parts don't sum to 100 | `The parts add up to <sum>%, not 100%` |
| a part's components don't sum to its weight | `The components of "<part>" add up to <sum>%, not <weight>%` |
| a part has both components and its own items | `"<part>" has components, so its items go in one of them` |
| an item appears twice | `An item is filed twice` |
| an id repeats | `The split has a repeated id; reload and try again` |
| an item is not on the checklist (`parseGrading` only) | `An item isn't on this checklist` |
| an item is a shift count (`parseGrading` only) | `Attendance has no score, so it can't count toward the grade` |
| `gradeLeafProblem`: unknown id | `That grading component no longer exists. Reload and try again.` |
| `gradeLeafProblem`: a part that has components | `"<part>" has components; pick one of them` |

In these messages, `<sum>` is `Math.round(sum * 100) / 100`.

Behaviour rules the tests pin:
- `parseGrading({ parts: [] })` returns `{ ok: true, value: null }`, which clears the split.
- `refile`: if the item is not gradeable → unfile it. If `leafId === undefined` → no change. Otherwise → `fileItem`.
- `fileItem` removes the item from every leaf, then appends it to `leafId` (if not null).
- `addComponent`: when the part had no components, the part's own items move into the new component.
- `computeGrades(null, …)` returns `{ invalid: false, grades: {} }`. When `splitProblem` reports a problem, it returns `{ invalid: true, grades: {} }`. Otherwise every student id in `progress` gets a `StudentGrade`. Ids not in `requirements` are ignored.

Algorithm (per student):

```
leaf(items)  = mean of itemScore over items present in requirements, ignoring nulls; null if none
part score   = components.length
                 ? Σ(w·s)/Σw over components with non-null s, else null
                 : leaf(part.items)
grade        = Σ(w·s)/Σw over parts with non-null s, else null
scored_weight = Σ weight of every leaf (component, or component-less part) whose score is non-null
```

- [ ] **Step 1: Write `scripts/check-course-grading.ts` with these checks**

```ts
const item = (over: Partial<ItemProgress> = {}): ItemProgress => ({ done: false, source: null, current: 0, target: 1,
  done_at: null, best_score: null, avg_score: null, level: null, has_grade: false, entries: [], marked: false, note: null, ...over });
const quizA = req({ kind: 'activity', activity_type: 'assessment', assessment_id: 'qa' });
const quizB = req({ kind: 'activity', activity_type: 'assessment', assessment_id: 'qb' });
const lab = req({ kind: 'manual', title: 'Return demo' });
const shifts = req({ kind: 'count', activity_type: 'shift', target_count: 4 });
const quizzes = req({ kind: 'count', activity_type: 'assessment', target_count: 3 });
const reqs = [quizA, quizB, lab, shifts, quizzes];
const split = (): GradingSplit => ({ parts: [
  { id: 'W', name: 'Written Exams', weight: 30, items: [], components: [
    { id: 'M', name: 'Midterm', weight: 15, items: [quizA.id] },
    { id: 'F', name: 'Final', weight: 15, items: [quizB.id] } ] },
  { id: 'L', name: 'Laboratory & Skills', weight: 70, items: [lab.id], components: [] } ] });

// computeGrades
const r1 = computeGrades(split(), reqs, { S: { [quizA.id]: item({ best_score: 76 }), [quizB.id]: item(), [lab.id]: item({ best_score: 85 }) } });
check('82.3 example (per-level rescale, not 83.4)', !r1.invalid && Math.abs(r1.grades.S.grade! - 82.3) < 1e-9);
eq('scored weight', r1.grades.S.scored_weight, 85);
eq('part scores', r1.grades.S.parts, { W: 76, L: 85 });
eq('component scores', r1.grades.S.components, { M: 76, F: null });
eq('empty part drops out', computeGrades(split(), reqs, { S: { [lab.id]: item({ best_score: 85 }) } }).grades.S.grade, 85);
eq('nothing scored', computeGrades(split(), reqs, { S: {} }).grades.S, { grade: null, scored_weight: 0, parts: { W: null, L: null }, components: { M: null, F: null } });
const withCount = split(); withCount.parts[1].items = [quizzes.id];
eq('count uses avg_score', computeGrades(withCount, reqs, { S: { [quizzes.id]: item({ avg_score: 80, best_score: 99 }) } }).grades.S.parts.L, 80);
eq('count with no work is unscored, not 0', computeGrades(withCount, reqs, { S: { [quizzes.id]: item({ avg_score: null }) } }).grades.S.parts.L, null);
const withShift = split(); withShift.parts[1].items = [lab.id, shifts.id];
eq('filed shift count ignored', computeGrades(withShift, reqs, { S: { [lab.id]: item({ best_score: 85 }), [shifts.id]: item({ current: 1, target: 4 }) } }).grades.S.parts.L, 85);
const withStale = split(); withStale.parts[1].items = [lab.id, 'gone'];
eq('stale id ignored', computeGrades(withStale, reqs, { S: { [lab.id]: item({ best_score: 85 }) } }).grades.S.parts.L, 85);
const broken = split(); broken.parts[1].weight = 60;
eq('invalid split gives no grades', computeGrades(broken, reqs, { S: {} }), { invalid: true, grades: {} });
eq('no split', computeGrades(null, reqs, { S: {} }), { invalid: false, grades: {} });

// parseGrading
const err = (body: unknown) => { const p = parseGrading(body, reqs); return p.ok ? null : p.error; };
check('valid split', parseGrading(split(), reqs).ok);
eq('clear', parseGrading({ parts: [] }, reqs), { ok: true, value: null });
const thirds = { parts: [33.33, 33.33, 33.34].map((weight, i) => ({ id: `p${i}`, name: `P${i}`, weight, items: [], components: [] })) };
check('thirds save', parseGrading(thirds, reqs).ok);
const rounded = parseGrading({ parts: [{ id: 'a', name: 'A', weight: 33.333, items: [], components: [] }, { id: 'b', name: 'B', weight: 66.667, items: [], components: [] }] }, reqs);
eq('weights rounded to 2 decimals', rounded.ok && rounded.value!.parts.map((p) => p.weight), [33.33, 66.67]);
const s95 = split(); s95.parts[1].weight = 65; eq('top sum', err(s95), 'The parts add up to 95%, not 100%');
const s25 = split(); s25.parts[0].components[1].weight = 10; eq('part sum', err(s25), 'The components of "Written Exams" add up to 25%, not 30%');
const sOn = split(); sOn.parts[0].items = [lab.id]; sOn.parts[1].items = []; eq('items on a split part', err(sOn), '"Written Exams" has components, so its items go in one of them');
const sDup = split(); sDup.parts[0].components[1].items = [quizA.id]; eq('filed twice', err(sDup), 'An item is filed twice');
const sUnknown = split(); sUnknown.parts[1].items = ['nope']; eq('unknown item', err(sUnknown), "An item isn't on this checklist");
const sShift = split(); sShift.parts[1].items = [shifts.id]; eq('shift refused', err(sShift), "Attendance has no score, so it can't count toward the grade");
const sBlank = split(); sBlank.parts[0].name = '  '; eq('blank name', err(sBlank), 'Every part and component needs a name');
const sSame = split(); sSame.parts[1].name = 'written exams'; eq('duplicate name', err(sSame), 'Two parts are both called "written exams"');
const sZero = split(); sZero.parts[0].components[0].weight = 0; eq('zero weight', err(sZero), '"Midterm" needs a percent above 0');
eq('too many parts', err({ parts: Array.from({ length: 11 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, weight: 100 / 11, items: [], components: [] })) }), 'A split can have at most 10 parts');
eq('not a split', err({ parts: 'x' }), 'Invalid grading split');

// helpers
eq('leaves', gradingLeaves(split()), [{ id: 'M', label: 'Written Exams › Midterm' }, { id: 'F', label: 'Written Exams › Final' }, { id: 'L', label: 'Laboratory & Skills' }]);
eq('leafOf', leafOf(split(), quizA.id), 'M');
eq('leaf problem: split part', gradeLeafProblem(split(), 'W'), '"Written Exams" has components; pick one of them');
eq('leaf problem: unknown', gradeLeafProblem(split(), 'zzz'), 'That grading component no longer exists. Reload and try again.');
eq('refile moves', leafOf(refile(split(), quizA, 'F'), quizA.id), 'F');
eq('refile unfiles attendance', leafOf(refile({ ...split(), parts: [{ ...split().parts[0] }, { ...split().parts[1], items: [shifts.id] }] }, shifts, 'L'), shifts.id), null);
eq('refile undefined leaves it', gradingSignature(refile(split(), quizA, undefined)), gradingSignature(split()));
const added = addComponent(split(), 'L', { id: 'R', name: 'Return demos', weight: 70, items: [] });
eq('first component takes the part items', [added.parts[1].items, added.parts[1].components[0].items], [[], [lab.id]]);
eq('signature ignores key order',
  gradingSignature({ parts: [{ weight: 100, name: 'A', id: 'x', items: [], components: [] }] }),
  gradingSignature({ parts: [{ id: 'x', name: 'A', weight: 100, components: [], items: [] }] }));
eq('signature of null', gradingSignature(null), 'null');
eq('stored junk', readStoredSplit({ parts: 'x' }), null);
eq('preset', presetSplit(() => 'id').parts.map((p) => [p.name, p.weight]), [['Written Exams', 30], ['Laboratory & Skills', 70]]);
eq('format', [formatGrade(82.3456), formatGrade(100)], ['82.3%', '100%']);
```

- [ ] **Step 2: Run the checks and confirm they fail**

Run: `cd web && npx tsx scripts/check-course-grading.ts`
Expected: a non-zero exit (module not found).

- [ ] **Step 3: Implement `course-grading.ts` to the interfaces and rules above**

`parseGrading` runs the type and shape checks, rounds the weights, runs `splitProblem` on the result, then checks each item against `requirements`. `splitProblem` checks in table order, so the first failing row is the message returned.

- [ ] **Step 4: Run both check scripts and typecheck**

Run: `cd web && npm run check:grading && npm run check:courses && npx tsc --noEmit`
Expected: all PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/app/lib/course-grading.ts web/scripts/check-course-grading.ts
git commit web/app/lib/course-grading.ts web/scripts/check-course-grading.ts web/package.json -m "feat(courses): grading split rules and weighted grade math"
```

---

## Phase 2: Migration and server

### Task 3: Migration 067

**Files:**
- Create: `web/supabase/migrations/067_course_grading.sql`

**Interfaces:**
- Produces:
  - `course_offerings.grading jsonb` (nullable), with constraint `course_offerings_grading_ck check (grading is null or jsonb_typeof(grading) = 'object')`
  - `course_requirements.manual_type text not null default 'lab'`, with constraint `course_requirements_manual_type_ck check (manual_type in ('lab','exam') and (kind = 'manual' or manual_type = 'lab'))`

- [ ] **Step 1: Write the migration**

Use the header-comment style of 065/066: what the grading split is, that grades are computed on read, that 067 doesn't depend on 066, and that RLS is unchanged. Use `add column if not exists`, and make each constraint idempotent (`drop constraint if exists` then `add constraint`).

- [ ] **Step 2: Validate it against a throwaway Postgres**

Follow the steps in memory `live-db-diverges-from-migrations`:
1. Run `initdb` into the scratchpad, then start with `pg_ctl` on `-h 127.0.0.1 -p 55467 -c unix_socket_directories=''`.
2. Create the roles `anon`, `authenticated` and `service_role`, and `create extension pgcrypto`.
3. Create minimal stubs for what 065 references: `public.users(id uuid pk)`, `public.sections(id uuid pk)`, `public.scenarios(id uuid pk)`, `public.assessments(id uuid pk)`, `public.case_presentations(id uuid pk)`, `public.taylor_skills(id text pk)`, and the function `public.set_updated_at()` returning a trigger.
4. Apply 065, then 067 twice.

Then run the expected outcomes:
- `insert` a manual requirement with `manual_type 'exam'` → OK.
- A skill requirement with `manual_type 'exam'` → check violation `course_requirements_manual_type_ck`.
- `update course_offerings set grading = '[]'` → check violation `course_offerings_grading_ck`.
- `grading = '{"parts":[]}'` → OK.
- The second apply of 067 → no errors.

Stop the cluster afterwards.

- [ ] **Step 3: Commit**

```bash
git add web/supabase/migrations/067_course_grading.sql
git commit web/supabase/migrations/067_course_grading.sql -m "feat(db): 067 course grading split and Written Exam kind"
```

### Task 4: Server reads and API client types

**Files:**
- Modify: `web/app/lib/courses.ts`. The requirement column list (~458) becomes shared, plus `loadRequirements`, `courseFailure` (~52), and a new `loadGrading`.
- Modify: `web/app/api/faculty/courses/[id]/route.ts` (GET adds `grading`, `grading_ready`)
- Modify: `web/app/api/faculty/courses/[id]/progress/route.ts` (adds `grading`, `grading_ready`)
- Modify: `web/app/lib/api.ts` (~4251–4370: `FacultyCourseDetail`, `CourseProgress`)

**Interfaces:**
- Consumes: `readStoredSplit`, `GRADING_NEEDS_MIGRATION`, `GradingSplit` from Task 2, and `ManualType` from Task 1.
- Produces, in `courses.ts`:

```ts
export const REQUIREMENT_COLUMNS: string; // today's list + ', manual_type'
export class MigrationNeeded extends Error {} // courseFailure → 503 { error: err.message }
/** 42703 / PGRST204: a 067 column is missing. */
export function isMissingGradingSchema(error: { code?: string } | null | undefined): boolean;
/** Runs `run(REQUIREMENT_COLUMNS, false)`; on a missing-067 error runs `run(<columns without manual_type>, true)`. Other errors throw. */
export async function requirementQuery<D>(run: (columns: string, legacy: boolean) => PromiseLike<{ data: D; error: { code?: string } | null }>): Promise<D>;
/** min_score to number, manual_type ?? 'lab'. */
export function normaliseRequirement(row: Record<string, unknown>): RequirementRow;
export async function loadGrading(supabase: Supabase, offeringId: string): Promise<{ grading: GradingSplit | null; ready: boolean }>;
```

- Produces, in `api.ts`: `FacultyCourseDetail` gains `grading: GradingSplit | null; grading_ready: boolean`. `CourseProgress` gains the same two fields.

- [ ] **Step 1: Make `loadRequirements` go through `requirementQuery` and `normaliseRequirement`**

Remove the three copies of the column string. The requirement routes import `REQUIREMENT_COLUMNS` in Task 5.

Note: `isMissingCourseSchema` already counts 42703/PGRST204 as "065 missing". `requirementQuery` must catch those first, or a pre-067 database would show the 065 notice on every course page.

- [ ] **Step 2: Add `MigrationNeeded`, `loadGrading` and the `courseFailure` branch**

- `loadGrading`: select `grading` from `course_offerings` by id. A missing column gives `{ grading: null, ready: false }`. Otherwise `{ grading: readStoredSplit(row.grading), ready: true }`.
- The `courseFailure` branch for `MigrationNeeded` returns `503 { error: err.message }`.

- [ ] **Step 3: Add `grading` and `grading_ready` to both GET routes and the `api.ts` types**

In both routes, call `loadGrading` inside the existing `Promise.all`. For progress, extend `loadOfferingProgress`'s `Promise.all` in `web/app/lib/course-requirements.ts` and return the two fields from `OfferingProgress`.

- [ ] **Step 4: Typecheck, then smoke-test against the live database (still pre-067)**

Run: `cd web && npx tsc --noEmit`. Expected: no errors.

Then, with the dev server running, open `/faculty/courses` and a course page signed in as an instructor (or curl `GET /api/faculty/courses/<id>` and `/progress` with a minted session).
Expected: 200 responses with `grading: null` and `grading_ready: false`, and the checklist renders as today. Live is pre-067, so this exercises the fallback.

- [ ] **Step 5: Commit**

```bash
git commit web/app/lib/courses.ts web/app/lib/course-requirements.ts "web/app/api/faculty/courses/[id]/route.ts" "web/app/api/faculty/courses/[id]/progress/route.ts" web/app/lib/api.ts -m "feat(courses): course and progress reads carry the grading split"
```

### Task 5: Server writes (grading PUT, filing on requirement routes)

**Files:**
- Create: `web/app/api/faculty/courses/[id]/grading/route.ts`
- Modify: `web/app/api/faculty/courses/[id]/requirements/route.ts` (POST)
- Modify: `web/app/api/faculty/courses/[id]/requirements/[requirementId]/route.ts` (PATCH, DELETE)
- Modify: `web/app/lib/api.ts` (fetchers)

**Interfaces:**
- Consumes: Task 2 (`parseGrading`, `gradingSignature`, `refile`, `fileItem`, `gradeLeafProblem`, the message constants) and Task 4 (`requirementQuery`, `REQUIREMENT_COLUMNS`, `normaliseRequirement`, `loadGrading`, `MigrationNeeded`).
- Produces:
  - `PUT /api/faculty/courses/[id]/grading`, body `{ parts: GradePart[]; base: string }`, returns `200 { grading: GradingSplit | null }`. Errors: `400` with the `parseGrading` message, `409` `GRADING_ENDED_LOCK`, `409` `'The grading split changed since you opened it. Reload to see the latest.'`, `503` `GRADING_NEEDS_MIGRATION`.
  - `api.ts`: `saveCourseGrading(offeringId: string, grading: GradingSplit | null, base: string)`. Its body is `{ parts: grading?.parts ?? [], base }`. `addRequirement` and `updateRequirement` take `input: RequirementInput & { grade_leaf_id?: string | null }`.

- [ ] **Step 1: The grading PUT**

1. `requireRole('faculty')`, then `loadOwnOffering` (404 if missing).
2. Ended term → 409.
3. `loadGrading`: `!ready` → 503.
4. `gradingSignature(stored) !== body.base` → 409.
5. `parseGrading(body, await loadRequirements(...))` → 400 on error.
6. Update `course_offerings.grading`.
7. `logAudit` with action `course.grading.update`, entity `course_offerings`, and details `{ course, term, split: 'Written Exams 30% · Laboratory & Skills 70%' }` (part names and weights joined with ` · `, or `'cleared'`).

- [ ] **Step 2: POST and PATCH file the item**

Before writing the row:
- Read `grade_leaf_id` from the body. Treat it as `undefined` if absent, `null` to unfile, or a string.
- If it is a string, `loadGrading` and return 400 on `gradeLeafProblem`.

Write the row through `requirementQuery`. When `legacy` is true, throw `new MigrationNeeded(EXAMS_NEED_MIGRATION)` if `manual_type === 'exam'`; otherwise drop `manual_type` from the payload. Normalise the row with `normaliseRequirement`.

After the write, if the grading is `ready` and stored:
- `next = refile(stored, row, leafId)`.
- Write it when `gradingSignature(next) !== gradingSignature(stored)`.

A PATCH turning an item into a shift count passes `leafId === undefined`, but `refile` still unfiles it.

- [ ] **Step 3: DELETE strips the item**

After the delete, if the grading is ready and stored, write `fileItem(stored, id, null)` when the signature changed.

- [ ] **Step 4: Add the `api.ts` fetchers, then typecheck and build**

Run: `cd web && npx tsc --noEmit && NEXT_DIST_DIR=.next-build npm run build`
Expected: no type errors, and the build succeeds.

Live is pre-067, so the PUT can only be exercised end-to-end in demo mode (Task 9) or after 067 is applied. Check the pre-067 path now: `curl -X PUT …/grading` with a minted instructor session should return 503 with `GRADING_NEEDS_MIGRATION`. If session minting is sandbox-blocked, record that it wasn't checked.

- [ ] **Step 5: Commit**

```bash
git add "web/app/api/faculty/courses/[id]/grading/route.ts"
git commit "web/app/api/faculty/courses/[id]/grading/route.ts" "web/app/api/faculty/courses/[id]/requirements/route.ts" "web/app/api/faculty/courses/[id]/requirements/[requirementId]/route.ts" web/app/lib/api.ts -m "feat(courses): save the grading split and file items from the checklist"
```

---

## Phase 3: UI

The repo has no UI test runner. Each UI task is verified with a typecheck plus the demo-mode visual pass in Task 10. Demo data lands in Task 9, so Phase 3 tasks only need to typecheck and build. Remember memory `clearRequestCache` gotcha: every write marks all `usePageData` pages stale and refetches, so editor drafts must live in component state.

### Task 6: Written Exam in the modal and topics, plus "Counts toward"

**Files:**
- Modify: `web/app/faculty/courses/topics.tsx` (add `exam` to `TOPICS`)
- Modify: `web/app/globals.css` (the `.dark` block that restates sky/indigo/violet, ~262 and ~421, also restates `fuchsia` 50/100/200/600/700)
- Modify: `web/app/faculty/courses/[id]/requirement-modal.tsx` (KINDS ~37, state, body ~141, new props)
- Modify: `web/app/faculty/courses/[id]/page-client.tsx` (pass `grading` to `RequirementModal`)

**Interfaces:**
- Consumes: `gradingLeaves`, `leafOf`, `isGradeable` (Task 2) and `FacultyCourseDetail.grading` (Task 4).
- Produces:
  - `TOPICS.exam = { key: 'exam', label: 'Written Exams', icon: faFilePen, blurb: 'Scores you enter', tile: 'bg-fuchsia-50 text-fuchsia-700', bar: 'bg-fuchsia-500', text: 'text-fuchsia-700' }`
  - New `RequirementModal` prop: `grading: GradingSplit | null`

- [ ] **Step 1: Topic style and dark-mode colours**

Add the topic entry. `groupByTopic` then picks it up through `TOPIC_ORDER`. Restate the fuchsia shades in each `.dark` block by mirroring the existing violet lines.

- [ ] **Step 2: The Written Exam card**

- KINDS entries gain an optional `manualType: ManualType`. Add `{ kind: 'manual', manualType: 'exam', label: 'Written Exam', hint: 'A paper exam; you enter each score', icon: faFilePen }` after Lab Activity, and give the Lab Activity card `manualType: 'lab'`.
- New state: `manualType`. Initialise it from `requirement?.manual_type`, or from `preset === 'exam'`, otherwise `'lab'`. Add `exam` to the `preset` handling wherever `'manual'` is matched.
- A card is active when `kind` matches and (`kind !== 'manual'` or `manualType` matches).
- `body` sends `manual_type: manualType`.
- The form for `exam` is the manual form (a title and a placeholder like "Midterm written exam"). Keep the 2-column grid working with 5 cards.

- [ ] **Step 3: The "Counts toward" select**

It renders only when `grading` is not null and `isGradeable({ kind, activity_type: activityType })`. The options are "Not counted" (`''`) plus `gradingLeaves(grading)`. The initial value is `leafOf(grading, requirement.id)` when editing, otherwise `''`. Send `grade_leaf_id: value || null`, and only when the select is shown.

- [ ] **Step 4: Typecheck**

Run: `cd web && npx tsc --noEmit`. Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git commit web/app/faculty/courses/topics.tsx web/app/globals.css "web/app/faculty/courses/[id]/requirement-modal.tsx" "web/app/faculty/courses/[id]/page-client.tsx" -m "feat(courses): Written Exam items and a Counts toward picker"
```

### Task 7: The Grading tab

**Files:**
- Modify: `web/app/faculty/courses/course-tabs.ts` (`COURSE_TABS` adds `"grading"`)
- Modify: `web/app/faculty/courses/[id]/page-client.tsx` (tab list ~166 adds `{ key: "grading", label: "Grading", icon: faPercent }`, and renders `GradingTab`)
- Create: `web/app/faculty/courses/[id]/grading-tab.tsx` (state, totals, save, layout)
- Create: `web/app/faculty/courses/[id]/grading-item-picker.tsx` (the "Add items" picker)

**Interfaces:**
- Consumes: Task 2 (`parseGrading`, `presetSplit`, `addComponent`, `fileItem`, `gradingSignature`, `isGradeable`, `GRADING_NEEDS_MIGRATION`), Task 5 (`saveCourseGrading`), `requirementNames` / `inTopicOrder` (Task 1), `TOPICS` / `TopicIcon` (`topics.tsx`), and the props from page-client: `offeringId`, `requirements: CourseRequirement[]`, `grading`, `gradingReady`, `locked`, `onSaved: () => void`.
- Produces: `export default function GradingTab(props)` and `export default function GradingItemPicker({ open, items, onPick, onClose })`.

- [ ] **Step 1: Wire the tab**

Add `"grading"` to `COURSE_TABS`, add the tab-bar entry, and render `<GradingTab …>` for `tab === "grading"` from the course detail data. Visiting `?tab=grading` must survive Back, per memory `courses-and-requirements` (navigation).

- [ ] **Step 2: States**

- `!gradingReady` → an amber notice with `GRADING_NEEDS_MIGRATION`.
- No split and not editing → the empty state "No grading split yet", with buttons **Start from Written Exams 30 / Laboratory & Skills 70** (`presetSplit(() => crypto.randomUUID())`) and **Start blank** (one part named "Part 1" at 100).
- `locked` → read-only, with the `GRADING_ENDED_LOCK` text.

- [ ] **Step 3: Editor**

The draft is held in state together with `base = gradingSignature(grading)` captured when editing starts. The draft resets from the server only while there are no unsaved edits.

- Each part is a card with a name input, a weight input (number, step 0.01) and component rows (name, weight, item chips, remove).
- **+ Component** uses `addComponent`, with weight 0 to fill in. **+ Part** adds a part. Each part has a remove button; removing a part or component unfiles its items.
- Live totals: the top-level sum ("100% ✓" or "85% · 15% left to assign") and, per part, "components add to 25 of 30".
- **Save** is disabled while `parseGrading(draft, requirements)` fails, and its message shows beside Save. **Discard** resets the draft. A **Clear split** action saves `null`, after a confirm.
- Save calls `saveCourseGrading(offeringId, draft, base)`. On a 409, show the message with a **Reload** button that calls `onSaved()` and resets the draft.

- [ ] **Step 4: Items**

- Chips use the topic icon and accent plus the item's `requirementNames` name. Removing a chip runs `fileItem(draft, id, null)`.
- **Add items** on each leaf opens `GradingItemPicker`, listing gradeable items not filed anywhere, grouped by `inTopicOrder`. Picking an item runs `fileItem(draft, id, leafId)`.
- A **"Not counted in the grade"** panel lists unfiled gradeable items, then shift counts greyed out with "Attendance has no score".

- [ ] **Step 5: Typecheck, build, and commit**

Run: `cd web && npx tsc --noEmit && NEXT_DIST_DIR=.next-build npm run build`. Expected: both succeed.

```bash
git add "web/app/faculty/courses/[id]/grading-tab.tsx" "web/app/faculty/courses/[id]/grading-item-picker.tsx"
git commit web/app/faculty/courses/course-tabs.ts "web/app/faculty/courses/[id]/page-client.tsx" "web/app/faculty/courses/[id]/grading-tab.tsx" "web/app/faculty/courses/[id]/grading-item-picker.tsx" -m "feat(courses): a Grading tab to split the grade into weighted parts"
```

### Task 8: The Grade column on Progress

**Files:**
- Modify: `web/app/faculty/courses/[id]/progress-tab.tsx` (header ~245–300, rows ~315+, toolbar)
- Create: `web/app/faculty/courses/[id]/grade-breakdown.tsx` (popover content)

**Interfaces:**
- Consumes: `computeGrades`, `formatGrade`, `StudentGrade`, `GradingSplit` (Task 2), and `CourseProgress.grading` (Task 4).
- Produces: `export default function GradeBreakdown({ split, grade }: { split: GradingSplit; grade: StudentGrade })`.

- [ ] **Step 1: Compute grades in the tab**

`const result = useMemo(() => computeGrades(progress?.grading ?? null, progress?.requirements ?? [], progress?.progress ?? {}), [progress])`. Because cells are patched with `setData`, the grade follows a just-entered score.

- [ ] **Step 2: The column**

When `progress.grading` is set, add a `<th rowSpan={2}>Grade</th>` after the last item column. Each row gets a `<td>` with a button showing `formatGrade(grade)`, or "—" when null. Add a muted "so far" when `scored_weight < 100`. The empty-row `colSpan` grows by one.

Clicking the button opens a popover with `GradeBreakdown`:
- each part with its score, and its components indented with theirs ("—" when unscored);
- the footer "<scored_weight>% of the grade scored so far".

- [ ] **Step 3: Toolbar states**

- No split → a "Set up grading" link to `courseTabHref(offeringId, "grading")`.
- `result.invalid` → an amber chip "Grading split needs fixing", linking to the same place, with no Grade column.
- `grading_ready === false` → nothing new.

- [ ] **Step 4: Typecheck, build, and commit**

Run: `cd web && npx tsc --noEmit && NEXT_DIST_DIR=.next-build npm run build`. Expected: both succeed.

```bash
git add "web/app/faculty/courses/[id]/grade-breakdown.tsx"
git commit "web/app/faculty/courses/[id]/progress-tab.tsx" "web/app/faculty/courses/[id]/grade-breakdown.tsx" -m "feat(courses): a weighted Grade column on the Progress grid"
```

---

## Phase 4: Demo and verification

### Task 9: Demo mode

**Files:**
- Modify: `web/app/lib/demo/fixtures/courses.ts` (`DemoOffering.grading`, a Written Exam per offering, scores, splits)
- Modify: `web/app/lib/demo/handlers/courses.ts` (`courseDb` back-fill, course GET, progress, PUT grading, POST/PATCH/DELETE filing)

**Interfaces:**
- Consumes: everything in Task 2, and the response shapes from Tasks 4–5.
- Produces: `DemoOffering.grading?: GradingSplit | null`. The demo handlers mirror the real routes' responses and error messages.

- [ ] **Step 1: Fixtures**

Add `manual_type: 'lab'` to `blank`. On `OFFERING_MAIN` and `OFFERING_FUNDAMENTALS`, add one item each: `{ kind: 'manual', manual_type: 'exam', title: 'Midterm written exam' }`. Give the exams entered scores through the same `signOff` pattern, for every doing-well student and some others, scores 70–95.

Then give each offering a split whose parts and components are fixed, with every gradeable item on that checklist filed and the shift count left out:

| Offering | Written Exams 30 | Laboratory & Skills 70 |
|---|---|---|
| NCM 101 (`OFFERING_MAIN`) | Midterm 15 (the exam), Quizzes 15 (the quiz count) | Return demonstrations 30 (the Lab Activity), Skills 40 (the four skill items) |
| NCM 103 (`OFFERING_FUNDAMENTALS`) | Midterm 15 (the exam), Quizzes 15 (the quiz count) | Lab reports 20 (the Lab Activity), Individual performance 30 (the scenario count, the skills), Case presentation 20 (the presentation; if `shared` is missing, give its 20 to Individual performance) |

Leave `OFFERING_PAST` with no split.

- [ ] **Step 2: Handlers**

- `courseDb`: for each requirement, `r.manual_type ??= 'lab'` (stores saved before this change).
- The course GET and progress add `grading: o.grading ?? null, grading_ready: true`.
- Add `route("PUT", "/api/faculty/courses/:id/grading", …)` with the same checks and messages as Task 5.
- The POST, PATCH and DELETE requirement handlers apply `gradeLeafProblem`, `refile` and `fileItem` exactly as the real routes do.

- [ ] **Step 3: Check saved demo stores (Review Focus 5)**

1. In a browser, open the demo, then in devtools delete `manual_type` from every saved requirement and `grading` from every offering in the persisted demo store (find the storage key in `web/app/lib/demo/`).
2. Reload, and open NCM 101's Requirements and Grading tabs.

Expected: no errors. Lab Activities render as before, and the Grading tab shows the empty state.

- [ ] **Step 4: Typecheck, build, and commit**

Run: `cd web && npx tsc --noEmit && NEXT_DIST_DIR=.next-build npm run build`. Expected: both succeed.

```bash
git commit web/app/lib/demo/fixtures/courses.ts web/app/lib/demo/handlers/courses.ts -m "feat(demo): grading splits and Written Exams in the demo courses"
```

### Task 10: End-to-end visual pass and memory

**Files:**
- Modify: `/home/mdk0/.claude/projects/-home-mdk0-Projects-icare/memory/courses-and-requirements.md` and `MEMORY.md`. Also add the 067 row to `live-migration-status.md`.

- [ ] **Step 1: Re-run the checks**

Run: `cd web && npm run check:grading && npm run check:courses`. Expected: all PASS.

- [ ] **Step 2: Demo-mode visual pass**

Use the approach in memory `visual-check-without-live-writes`: puppeteer-core with system Firefox, demo login as the instructor. Check:
- **Grading tab (NCM 101):** the split renders with totals "100% ✓".
- **Totals:** change Midterm to 10 → "components add to 25 of 30" and Save is disabled with that message. Change it back.
- **Add a component** to Laboratory & Skills; the items stay put when it isn't the first.
- **Clear split** → empty state → **Start from Written Exams 30 / Laboratory & Skills 70** → the two parts with no items, and the items listed under "Not counted in the grade". Attendance appears greyed.
- **Requirements → Add requirement:** a Written Exam card, and the "Counts toward" select lists the leaves. Create "Final written exam" filed under Written Exams › Midterm. It appears in a Written Exams section after Quizzes, and in the chip list on the Grading tab.
- **Progress:** the Grade column shows percents. "so far" shows for students missing work. The breakdown popover lists parts and components. Entering a score in an exam cell changes that student's grade without a reload.
- **Ended term:** the past offering's Grading tab is read-only.
- **Stale draft (Review Focus 2):** in devtools on the course page, `await fetch('/api/faculty/courses/<id>/grading', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ parts: [], base: 'stale' }) }).then((r) => r.status)` → `409`. The split must be unchanged afterwards.
- Take screenshots of the Grading tab, the modal and the Progress grid at desktop width and 390 px wide.

- [ ] **Step 3: Live pre-067 sanity check**

With the dev server pointed at the live DB, the course page, Requirements and Progress load as before. The Grading tab shows the 067 notice, and adding a Written Exam shows `EXAMS_NEED_MIGRATION`.

- [ ] **Step 4: Update memory**

- `courses-and-requirements.md`: add a "Grading split (2026-10-07)" paragraph covering `course_offerings.grading` JSON, the two levels, per-level rescaling, grades computed client-side in the Progress tab, Written Exam = manual + `manual_type`, and "067 NOT live". Note that mobile shows exams as manual items with no grade.
- `live-migration-status.md`: add 067 as not applied.

Memory files live outside the repo, so there is nothing to commit.
