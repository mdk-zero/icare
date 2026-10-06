# Course grading split: weighted grading components per course

## Context

An instructor's course (an offering: instructor × course × term) has a requirements checklist of Patient Cases, Quizzes, Skills and Lab Activities. Each item already carries a score in the Progress grid, either graded in the app or entered by the instructor (066). There is no **grade**: nothing combines those scores. Instructors want to divide the grade their own way, for example Written Exams 30% / Laboratory & Skills 70%, each split further into components such as Midterm, Final, Lab reports or Individual performance. The percents add up to 100%, and the result is a weighted grade per student.

Decisions agreed in brainstorming (2026-10-06):
- **Two levels.** Parts sum to 100%. A part's components sum to that part's share. Both levels are percents of the final grade, so Midterm 15 + Final 15 = Written 30.
- **Sources are checklist items.** Each item is filed under one leaf: a component, or a part with no components.
- **Plain average** of the items inside a component.
- **Unscored work is left out.** The grade reads "so far" and rescales per level. An empty component drops out within its part, so the part keeps its full share once anything in it is scored. An empty part drops out of the whole. Example: Midterm 76 (Final unscored), Lab 85 → 0.3·76 + 0.7·85 = **82.3%**.
- **Percent only.** No 1.0–5.0 transmutation and no pass/fail.
- **A new Grading tab** holds the setup, and the item modal gets a "Counts toward" picker. The checklist keeps its sections by kind of work.
- **A new Written Exam kind** for paper exams: a manual item scored by hand, with its own section after Quizzes ("Written Exam #1").
- **Storage approach A:** one JSON document on the offering, with grades computed on read.
- Owned by the offering's instructor. The Dean doesn't see grades, students don't, and mobile is unchanged.
- **Attendance (shift counts) has no score**, so it can't be graded. Unfiled items don't affect the grade. The split locks when the term ends, like the checklist.

## Design

### Data: migration `web/supabase/migrations/067_course_grading.sql`
- `course_offerings.grading jsonb` (null means not set up).
- `course_requirements.manual_type text not null default 'lab' check (manual_type in ('lab','exam'))`, plus `check (kind = 'manual' or manual_type = 'lab')`.
- 067 is independent of 066 (not live yet), so they can be applied in either order.

### Pure logic: new `web/app/lib/course-grading.ts`
No server imports, so the API and the demo share it, like `course-progress.ts`.
- Types: `GradingSplit = { parts: GradePart[] }`, `GradePart = { id, name, weight, items: string[], components: GradeComponent[] }`, `GradeComponent = { id, name, weight, items: string[] }`. Ids are generated in the browser (`crypto.randomUUID()`) and stay stable.
- **`parseGrading(body, requirements)`** returns `Parsed<GradingSplit>`:
  - 1–10 parts, each with 0–10 components. Names are 1–60 characters, trimmed, and unique among siblings (case-insensitive).
  - Weights are > 0 and ≤ 100, rounded to 2 decimals.
  - Parts sum to 100 and a part's components sum to the part's weight, each within ±0.01.
  - Items appear only on leaves (a part with components holds none directly) and at most once. Each must be a requirement of this offering, and not a shift count.
  - `{ parts: [] }` normalises to null, which clears the split.
- **`itemScore(req, item)`**: count (non-shift) → `avg_score`; shift → none; activity, skill or manual → `best_score`. Reuse `entryMode()` from `course-progress.ts` to recognise attendance.
- **`isGradeable(req)`**: true unless the item is a shift count.
- **`splitProblem(split)`** returns the first sum or shape rule a stored split breaks, or null. `parseGrading` and `computeGrades` both use it.
- **`computeGrades(split, requirements, progress)`** returns `{ invalid: boolean; grades: Record<studentId, StudentGrade> }`, where `StudentGrade = { grade, scored_weight, parts: Record<id, number|null>, components: Record<id, number|null> }`:
  - A leaf's score is the mean of its non-null item scores.
  - A part with components takes the weight-rescaled mean of its scored components. Without components, it takes its leaf mean.
  - The grade is the weight-rescaled mean of the scored parts, or null.
  - `scored_weight` is the sum of the weights of leaves that have a score.
  - Ids not on the checklist are ignored. If `splitProblem(split)` reports a problem, return `{ invalid: true, grades: {} }`.
- **`gradingLeaves(split)`** returns `[{ id, label: "Written Exams › Midterm" }]` for the modal's picker.
- **`fileItem(split, reqId, leafId|null)`** and **`unfileItem(split, reqId)`** are pure helpers the routes use.

### Changes to `web/app/lib/course-progress.ts`
- `RequirementRow.manual_type: 'lab' | 'exam'`, and `RequirementTopicKey` gains `'exam'`.
- `topicKey()` returns `'exam'` for `kind='manual' && manual_type='exam'`. Its Pick type gains `manual_type`, and `inTopicOrder` and `requirementNames` follow.
- `TOPIC_ORDER` becomes `['scenario','assessment','exam','case_presentation','skill','manual','shift']`, and `TOPIC.exam = 'Written Exam'`.
- `parseRequirement`: for manual items, accept `manual_type` ('lab' default, or 'exam'). Other kinds are forced to 'lab'.
- `offeringSummary().to_score` already counts every `kind==='manual'` item, so exams are included. Update its comment.

### Server
- **`web/app/lib/courses.ts` `loadRequirements`:** select `manual_type`. On 42703/PGRST204, retry without it and default to `'lab'` (follow the `isMissingScoresTable` pattern in `course-requirements.ts`).
- **New `loadGrading(supabase, offeringId)`:** returns `{ grading, ready }`, with `ready: false` while the column is missing. Add the export `GRADING_NEEDS_MIGRATION = 'The grading split needs database migration 067 (course grading) applied first.'`.
- **`GET /api/faculty/courses/[id]`** (`app/api/faculty/courses/[id]/route.ts`): add `grading` and `grading_ready`.
- **`loadOfferingProgress`** (`app/lib/course-requirements.ts`) and **`GET …/[id]/progress`:** add `grading` and `grades` (from `computeGrades`). Add `grading_invalid` when the split doesn't add up.
- **New `app/api/faculty/courses/[id]/grading/route.ts` `PUT`:**
  - `requireRole('faculty')`, then `loadOwnOffering`. An ended term returns 409 with `GRADING_ENDED_LOCK = 'This term has ended, so its grading split is locked. Scores can still be changed.'`.
  - `parseGrading` against `loadRequirements`, then update `course_offerings.grading`.
  - Audit-log `course.grading.update` with the course, the term and the part/weight summary.
  - Returns 503 `GRADING_NEEDS_MIGRATION` when the column is missing, and errors through `courseFailure`.
- **Requirement routes** (`…/requirements/route.ts` POST, `…/[requirementId]/route.ts` PATCH and DELETE):
  - Write `manual_type`. Creating a Written Exam before 067 returns the 503.
  - POST/PATCH accept an optional `grade_leaf_id` (`null` unfiles). After saving the row, apply `fileItem` and write `grading` when it changed. An item that becomes a shift count is always unfiled.
  - DELETE runs `unfileItem`.
  - Grading writes are skipped silently while the column is missing.
- Add `manual_type` to the requirement routes' `COLUMNS` strings, with the same fallback as `loadRequirements`.

### UI (`web/app/faculty/courses/…`)
- **`course-tabs.ts`:** `COURSE_TABS = ["progress","requirements","skills","grading"]`. `course-tab-bar.tsx` gets a Grading tab.
- **New `[id]/grading-tab.tsx`:**
  - **Empty state:** "No grading split yet", with a **Start from Written Exams 30 / Laboratory & Skills 70** preset (two parts, no components) and **Start blank**.
  - **Editor:**
    - Each part is a card with a name, a weight %, and component rows (name, weight %, item chips), plus **+ Component**. Below the cards is **+ Part**.
    - Remove buttons work at both levels. Adding the first component to a part that holds items moves those items into the new component.
    - Live totals show "100% ✓" or "85%, 15% left", and per part, "components add to 25 of 30".
    - **Save** stays disabled until the split is valid (it calls `parseGrading` on the client). **Discard** reverts.
    - Edit state is held in component state, because every write calls `clearRequestCache()` and refetches.
  - **Items:** each leaf shows chips styled with the topic's icon and accent from `topics.tsx` ("Quiz #2", named by `requirementNames`). **Add items** opens a picker of unfiled gradeable items, grouped by section. Removing a chip unfiles the item.
  - **"Not counted in the grade"** panel: unfiled gradeable items, plus attendance items greyed out with "Attendance has no score".
  - Read-only with a lock note when the term has ended. Shows the 067 notice while `grading_ready` is false.
- **`topics.tsx`:** add an `exam` topic style: "Written Exams", the `faFilePen` icon, "Scores you enter", and an accent distinct from the existing ones and from the emerald/amber status colours.
- **`[id]/requirement-modal.tsx`:**
  - Add a fifth kind card, **Written Exam** ("A paper exam; you enter each score"). It sends `kind:'manual', manual_type:'exam'` and uses the same form as Lab Activity.
  - Add a **"Counts toward"** `<select>` from `gradingLeaves()` plus "Not counted". It shows only when a split exists and `isGradeable`, and sends `grade_leaf_id`.
- **`[id]/progress-tab.tsx`:**
  - A **Grade** column at each row's end shows the grade (for example "82.3%"), with a muted "so far" when `scored_weight < 100`.
  - Clicking it opens a breakdown popover of parts and components with their scores.
  - With no split, show a toolbar link "Set up grading" to `courseTabHref(id,'grading')`. With `grading_invalid`, show "Grading split needs fixing".
  - ⚠ This file and both `page-client.tsx` files had another session's uncommitted changes on 2026-10-06. Check `git status` before editing. If they're still uncommitted, ask the user before touching or committing those paths.
- **`[id]/page-client.tsx`:** render `GradingTab` for `tab === 'grading'`, passing the course detail data (requirements and grading) and a refresh.

### Demo (`web/app/lib/demo/`)
- `fixtures/courses.ts`: give NCM 101 and NCM 103 a `grading` split (Written Exams 30: Midterm 15 / Final 15; Laboratory & Skills 70: Lab reports 20 / Individual performance 30 / Return demonstrations 20), add one Written Exam item each with entered scores, and file the existing items.
- `handlers/courses.ts`: return `grading`/`grading_ready: true` on the course GET, and `grading`/`grades` on progress (via `computeGrades`). Add the `PUT …/grading` handler, and handle `manual_type`/`grade_leaf_id` on the requirement handlers.

## Phases (each one committed by path on main after a green typecheck and build; no push)
1. **Pure logic:** `course-grading.ts`, the `course-progress.ts` exam topic and `manual_type`, plus the new `scripts/check-course-grading.ts` (`npm run check:grading`) and `check-course-progress.ts` updates.
2. **Migration and server:** 067, the loaders with fallbacks, the course GET and progress additions, the new grading PUT, and the requirement route changes.
3. **UI:** `course-tabs`, tab bar, `topics` exam style, Grading tab, modal kind and picker, Progress Grade column.
4. **Demo:** fixtures and handlers.

## Verification
- `npx tsx scripts/check-course-grading.ts` covers:
  - Sum rules: a bad top-level sum fails, a bad part sum fails, ±0.01 passes.
  - Placement: an item on a non-leaf part fails, a duplicate item fails, and a shift count fails.
  - Math: the 82.3 example; per-level rescaling versus a part with nothing scored; null when nothing is scored; a count item uses `avg_score`; a stale id is ignored; an invalid split gives no grades.
- `npm run check:courses` still passes, plus new cases for Written Exam naming, `TOPIC_ORDER` and `parseRequirement` `manual_type`.
- Run 067 against a local throwaway Postgres loaded with 065, then 067 (the live DB diverges from the migrations), including the check constraint on a non-manual exam.
- Typecheck, then `NEXT_DIST_DIR=.next-build npm run build` beside the running dev server.
- Visual pass in **demo mode** (puppeteer-core + system Firefox; demo needs no live writes):
  - Grading tab: preset, add a component, the totals, Save disabled at 95%, file and unfile items.
  - Modal: the Written Exam card and the Counts toward picker.
  - Progress: the Grade column, "so far", and the breakdown popover.
  - Also check the "Set up grading" link appears when the split is cleared.
- Live: until 067 is applied, the course pages behave as today, the Grading tab shows the migration notice, and the progress GET still returns 200. Record "067 NOT live" in memory.

## Next step
Once this spec is approved, `superpowers:writing-plans` turns the phases above into the step-by-step implementation plan.
