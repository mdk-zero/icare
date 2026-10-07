# Grading Tab Merge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fold the course page's Requirements tab into the Grading tab, so items are listed and managed inside the grade split, and call Skill checklist items "Return Demonstrations" in the UI.

**Architecture:**
- **Rename:** label-only (`TOPIC`, topic styles, form copy, demo data); the code name `kind: 'skill'` stays.
- **Rows:** the Grading tab renders checklist items as full rows inside each component, plus a bottom section for items that don't count. The page owns the item form and passes callbacks down.
- **Unsaved split edits:** an item saved during them is filed into the draft (pure `afterItemSaved`). Saves compare against the split the draft began from, minus what item changes removed (pure `settle` + `saveBase`), so item removals don't trip the stale-split check.

**Tech Stack:** Next.js App Router (read `web/AGENTS.md`: this Next.js differs from what you know), React client components, Tailwind, FontAwesome. There's no test runner: checks are tsx scripts.

**Spec:** `docs/superpowers/specs/2026-10-08-grading-tab-merge-design.md`

## Global Constraints

- **Working copy:** work in `web/` on `main`. Commit each task by path: `git add -- <new files>` then `git commit <paths> -m …`, never `git add -A` or `git commit -a`. No push. No `Co-Authored-By` trailer.
- **Leave alone:** `web/app/faculty/layout-client.tsx` is another session's uncommitted work. Don't touch or commit it.
- **Code names unchanged:** `kind: 'skill'`, the topic key `skill` and all columns. The rename is display text only.
- **No changes** to API routes, the database, migrations or the mobile app.
- **Exact copy:**
  - topic label "Return Demonstrations"; blurb "Met by graded Patient Case tasks or Quizzes on the skill";
  - item name "Return Demonstration #N";
  - kind card "Return Demonstration", hint "A course skill, met by graded Patient Case tasks or Quizzes on it";
  - Lab Activity hint "Hands-on work you score yourself, like a lab report or a skills-lab check-off";
  - tab bar action "Add item";
  - sections "Not counted in the grade" and "Checklist";
  - attendance note "No score, so it can't count";
  - leaf buttons "New item" and "Existing item".
- **Verify each task with:**
  - `npm run -s check:courses`
  - `npm run -s check:grading`
  - `npx tsc --noEmit`
  - and, before each commit, `NEXT_DIST_DIR=.next-build npm run build` (a dev server is running on :3000; never build into `.next`).

## Review Focus

1. **Discarding a draft after adding an item into an unsaved component:** the item must still exist, listed under "Not counted", not vanish. *(Task 2 check; Task 5 browser.)*
2. **Removing an item that a dirty draft has filed, then saving:** the save must be accepted, and the saved split must not contain the removed id. *(Task 2 checks.)*
3. **Editing an item into Attendance while the split is dirty:** the draft must unfile it, and the save must still be accepted. *(Task 2 check.)*
4. **The split editor unavailable** (`grading_ready: false`): the checklist must still list items and allow add, edit and remove. *(Task 5 browser, by patching the GET.)*
5. **An ended term:** no menu, no add buttons and no "Stop counting" anywhere on Grading, and nothing writable. *(Task 5 browser.)*

---

### Task 1: Skill items become Return Demonstrations

**Files:**
- Modify: `web/app/lib/course-progress.ts` (`TOPIC.skill`, and the doc comment naming "Skill #2")
- Modify: `web/app/faculty/courses/topics.tsx` (`skill` style: `label`, `blurb`)
- Modify: `web/app/faculty/courses/[id]/requirement-modal.tsx` (`KINDS` entries for `skill` and the lab `manual`; the comment "A new Skill item's skill")
- Modify: `web/app/faculty/courses/[id]/skills-tab.tsx:152` (copy) and its two comments that say "Skill requirement"
- Modify: `web/app/lib/demo/fixtures/courses.ts` (titles, `signOff` calls, component names)
- Test: `web/scripts/check-course-progress.ts`, `web/scripts/check-course-grading.ts`

**Interfaces:**
- Produces: `requirementNames()` returns "Return Demonstration #N" for `kind: 'skill'`, and `TOPICS.skill.label === "Return Demonstrations"`.

- [ ] **Step 1: Write the failing checks**

In `check-course-progress.ts`, change the expected arrays in the `requirementNames` and `inTopicOrder` checks:
- `'Skill #1'` becomes `'Return Demonstration #1'`, and `'Skill #2'` becomes `'Return Demonstration #2'`.
- The `inTopicOrder` expectation becomes `['Patient Case #1', 'Quiz #1', 'Quiz #2', 'Return Demonstration #1', 'Lab Activity #1', 'Attendance #1']`.

In `check-course-grading.ts`, after the existing "demo fixtures" checks, add:

```ts
const handScored = demo.requirements.filter((r) => r.kind === 'manual' && r.manual_type === 'lab').map((r) => r.title);
eq('no hand-scored demo item is called a return demonstration', handScored.filter((t) => /return demonstration/i.test(t)), []);
const demoComponents = demoSplits.flatMap((o) => o.grading!.parts.flatMap((p) => p.components));
const returnDemos = demoComponents.filter((c) => /return demonstration/i.test(c.name));
check('a demo component is named Return demonstrations', returnDemos.length > 0);
check(
  '…and holds only Return Demonstrations (skill items)',
  returnDemos.every((c) => c.items.length > 0 && c.items.every((id) => demo.requirements.find((r) => r.id === id)?.kind === 'skill')),
);
```

- [ ] **Step 2: Run them, expecting failures**

Run: `cd web && npm run -s check:courses; npm run -s check:grading`
Expected:
- `check:courses` FAILs on "numbered within each topic" and "sections in a fixed order".
- `check:grading` FAILs on "no hand-scored demo item…" (four titles) and on "…holds only Return Demonstrations".

- [ ] **Step 3: Implement the rename**

- `TOPIC.skill = 'Return Demonstration'`. In the doc comment, "Skill #2" becomes "Return Demonstration #2".
- `topics.tsx` `skill`: `label: "Return Demonstrations"`, `blurb: "Met by graded Patient Case tasks or Quizzes on the skill"`.
- Modal `KINDS`:
  - skill: `label: "Return Demonstration"`, `hint: "A course skill, met by graded Patient Case tasks or Quizzes on it"`;
  - lab manual: `hint: "Hands-on work you score yourself, like a lab report or a skills-lab check-off"`.
- `skills-tab.tsx:152`: "…; Return Demonstrations choose from this list." Comments say "Return Demonstration item".
- Demo titles (update the matching `signOff(...)` / `finished(...)` / `itemIds` title strings too):

  | Old title | New title |
  |---|---|
  | "Head-to-toe assessment return demonstration, signed by the clinical instructor" | "Head-to-toe assessment check-off, signed by the clinical instructor" |
  | "Oxygen therapy return demonstration (nasal cannula and face mask)" | "Oxygen therapy check-off (nasal cannula and face mask)" |
  | "Vital signs return demonstration" | "Vital signs check-off" |
  | "Head-to-toe assessment return demonstration" (past term) | "Head-to-toe assessment check-off" |

  The past-term `itemIds(OFFERING_PAST, (r) => r.title.endsWith("return demonstration"))` becomes `endsWith("check-off")`.
- Demo components:

  | Course | Old name | New name |
  |---|---|---|
  | NCM 101 | "Return demonstrations" (lab) | "Lab check-offs" |
  | NCM 101 | "Skills" | "Return demonstrations" |
  | Last term's NCM 101 | "Return demonstrations" | "Lab check-offs" |

- [ ] **Step 4: Run the checks, expecting passes**

Run: `cd web && npm run -s check:courses && npm run -s check:grading && npx tsc --noEmit`
Expected: "All checks passed" from both, and tsc silent. Every earlier demo check still passes, including the ended course's complete grades.

- [ ] **Step 5: Build and commit**

Run: `cd web && NEXT_DIST_DIR=.next-build npm run build` (expect exit 0), then:

```bash
git commit web/app/lib/course-progress.ts web/app/faculty/courses/topics.tsx "web/app/faculty/courses/[id]/requirement-modal.tsx" "web/app/faculty/courses/[id]/skills-tab.tsx" web/app/lib/demo/fixtures/courses.ts web/scripts/check-course-progress.ts web/scripts/check-course-grading.ts -m "feat(courses): Skill checklist items are Return Demonstrations"
```

---

### Task 2: The draft follows item changes

**Files:**
- Modify: `web/app/lib/course-grading.ts` (new `settle`)
- Modify: `web/app/faculty/courses/grading-draft.ts` (`from`, `saveBase`, `afterItemSaved`)
- Modify: `web/app/faculty/courses/[id]/grading-tab.tsx`. The save sends `saveBase(state, requirements)` instead of `state.base`, and `parsed` uses `settle(draft, requirements)` instead of `dropUnknown(draft, requirements)`, so an item turned into attendance elsewhere can't block saving.
- Test: `web/scripts/check-course-grading.ts`

**Interfaces:**
- Produces:
  - `settle(split: GradingSplit | null, requirements: readonly RequirementRow[]): GradingSplit | null` returns the split with every item id unfiled that is not on the checklist or not `isGradeable`. Order and everything else are kept, and null stays null.
  - `interface GradingDraft { draft; base; seen; from: GradingSplit | null }`. `from` is the stored split the edits began from. `startDraft`, `savedDraft`, and `followServer` (when it adopts) set it; a dirty `followServer` keeps it.
  - `saveBase(state: GradingDraft, requirements: readonly RequirementRow[]): string` returns `gradingSignature(settle(state.from, requirements))`.
  - `afterItemSaved(state: GradingDraft, row: RequirementRow, leafId: string | null | undefined): GradingDraft`. When `isDirty(state)` and `state.draft` is set, it returns `{ ...state, draft: refile(state.draft, row, leafId) }`. Otherwise it returns `state` itself, the same object, because the server filed it.

- [ ] **Step 1: Write the failing checks** (append before `console.log('demo fixtures')`, importing `settle`, `saveBase` and `afterItemSaved`)

```ts
console.log('item changes during unsaved edits');
const sSettle = split();
sSettle.parts[1].items = [lab.id, shifts.id, 'gone', quizzes.id];
eq('settle drops removed and attendance ids, keeps order', settle(sSettle, reqs)?.parts[1].items, [lab.id, quizzes.id]);
eq('settle keeps null', settle(null, reqs), null);
eq('startDraft remembers where it began', startDraft(oldSplit).from, oldSplit);
eq('a clean draft adopting the server moves from', followServer(clean, newSplit).from, newSplit);
eq('a dirty draft keeps from', followServer(edited, newSplit).from, oldSplit);
eq('savedDraft moves from', savedDraft(edited, newSplit).from, newSplit);
const before = split();
const dirty = { ...startDraft(before), draft: { parts: [{ ...before.parts[0], name: 'Exams' }, before.parts[1]] } };
const reqsAfter = reqs.filter((r) => r.id !== quizB.id);
eq('after a removal, a dirty draft saves against the server\'s new split', saveBase(dirty, reqsAfter), gradingSignature(fileItem(before, quizB.id, null)));
check('a dirty draft holding a removed item still parses', parseGrading(settle(dirty.draft, reqsAfter), reqsAfter).ok);
const elsewhere: GradingSplit = { parts: [before.parts[0], { ...before.parts[1], name: 'Lab' }] };
check('a change made elsewhere still differs', saveBase(dirty, reqs) !== gradingSignature(elsewhere));
const toShift: RequirementRow = { ...quizB, kind: 'count', activity_type: 'shift', target_count: 4, assessment_id: null };
const reqsShift = reqs.map((r) => (r.id === quizB.id ? toShift : r));
eq('an item turned into attendance: the save base matches the server', saveBase(dirty, reqsShift), gradingSignature(refile(before, toShift, undefined)));
eq('…and the dirty draft unfiles it', leafOf(afterItemSaved(dirty, toShift, 'F').draft, quizB.id), null);
const fresh = req({ kind: 'manual', title: 'Final exam', manual_type: 'exam' });
const withNew = { ...dirty, draft: addComponent(dirty.draft!, 'W', { id: 'X', name: 'Practical', weight: 0, items: [] }) };
eq('a new item lands in an unsaved component', leafOf(afterItemSaved(withNew, fresh, 'X').draft, fresh.id), 'X');
eq('…and discarding the draft leaves it uncounted', leafOf(startDraft(before).draft, fresh.id), null);
const cleanBefore = startDraft(before);
check('a clean draft is left for the server to file', afterItemSaved(cleanBefore, fresh, 'M') === cleanBefore);
```

- [ ] **Step 2: Run, expecting failure**

Run: `cd web && npm run -s check:grading`
Expected: it fails to run with `settle` (or `saveBase` / `afterItemSaved`) "is not exported" / not a function, or tsx reports an import error.

- [ ] **Step 3: Implement** `settle` in `course-grading.ts` (beside `dropUnknown`), then `from`, `saveBase` and `afterItemSaved` in `grading-draft.ts` per the Interfaces block. Then make the two `grading-tab.tsx` changes listed under Files.

- [ ] **Step 4: Run, expecting passes**

Run: `cd web && npm run -s check:grading && npm run -s check:courses && npx tsc --noEmit`
Expected: "All checks passed" from both, and tsc silent.

- [ ] **Step 5: Build and commit**

Run the build (exit 0), then:

```bash
git commit web/app/lib/course-grading.ts web/app/faculty/courses/grading-draft.ts "web/app/faculty/courses/[id]/grading-tab.tsx" web/scripts/check-course-grading.ts -m "feat(courses): the grading draft follows item changes"
```

---

### Task 3: Items as rows inside the Grading tab

The Requirements tab still exists after this task, so every commit works.

**Files:**
- Create: `web/app/faculty/courses/[id]/requirement-row.tsx`
- Create: `web/app/faculty/courses/[id]/checklist-section.tsx`
- Modify: `web/app/faculty/courses/[id]/grading-tab.tsx`
- Modify: `web/app/faculty/courses/[id]/requirement-modal.tsx`
- Modify: `web/app/faculty/courses/[id]/page-client.tsx`

**Interfaces:**
- Consumes (Task 2): `afterItemSaved` and `isDirty`.
- Produces:
  - **`ItemRow`**, the default export of `requirement-row.tsx` (not `RequirementRow`, which is already the row *type* in `course-progress.ts`):
    `({ requirement: CourseRequirement; name: string; note?: string; actions: MenuAction[] | null }) => JSX.Element`.
    It renders an `<li>`: `TopicIcon` (size "sm") for `TOPICS[topicKey(r)]`, the name in semibold, `requirementDetail(r)` in gray, `note` in gray-400 when given, and the rose "The linked activity was deleted" badge when `r.removed`. On the right is `ActionsMenu variant="compact"` when `actions` is set. The markup follows the old `RequirementRowView` in `page-client.tsx`, minus the arrows.
  - **`ChecklistSection`**, the default export of `checklist-section.tsx`:
    `({ title: string; items: CourseRequirement[]; names: Map<string, string>; locked: boolean; empty?: ReactNode; onNew: () => void; actionsFor: (r: CourseRequirement) => MenuAction[]; noteFor?: (r: CourseRequirement) => string | undefined }) => JSX.Element`.
    It renders a card with a header (`title` in the small uppercase style the "Not counted" section uses now), the rows, `empty` when there are no items, and, unless `locked`, a "+ New item" button. `ChecklistSkeleton` (named export) is the old Requirements skeleton, moved here.
  - **`GradingTab` gains props:** `onNewItem(leafId: string | null): void`, `onEditItem(r: CourseRequirement): void` and `onRemoveItem(r: CourseRequirement): void`.
  - **`RequirementModal` changes:**
    - `grading` is now the draft split, so "Counts toward" lists unsaved components;
    - new `leafId?: string | null`, a new item's starting "Counts toward" (absent means "Not counted");
    - new `fileLocally: boolean`, which leaves `grade_leaf_id` out of the request;
    - `onSaved(saved: CourseRequirement, leafId: string | null | undefined)`, where `leafId` is `showLeaf ? leafId || null : undefined` and `saved` is `result.data.requirement`.

- [ ] **Step 1: Create `requirement-row.tsx` and `checklist-section.tsx`** per the Interfaces block. Row menu actions come from the caller.

- [ ] **Step 2: Render rows in `grading-tab.tsx`**

- **Each leaf** (a component, or a part without components) renders a `<ul>` of `ItemRow`s for `leaf.items` (known ids only, in `inTopicOrder`) instead of chips.
- **Row actions** when not locked: Edit (`faPenToSquare`, calls `onEditItem`), "Stop counting" (`faXmark`, calls `edit(fileItem(draft, id, null))`) and Remove (`faTrashCan`, `danger`, calls `onRemoveItem`).
- **Under the rows**, unless locked: "+ New item" (`onNewItem(leaf.id)`) and, when `unfiled.length > 0`, "+ Existing item" (opens the existing `GradingItemPicker`). Show "No items yet" in gray when the leaf is empty and locked.
- **Component rows** keep the name, percent and remove controls from the current layout. On `sm`+, the item list sits under the name row, indented to the name column; drop the chips grid column.
- **"Not counted in the grade" section:** replace it with a `ChecklistSection` titled "Not counted in the grade". Items are `unfiled` plus `attendance`, with `noteFor` returning "No score, so it can't count" for attendance, and `onNew = () => onNewItem(null)`. Attendance rows offer Edit and Remove only. Render the section only when it has items or the term is not locked.
- **No split** (`!draft`): below the existing empty card, render a `ChecklistSection` titled "Checklist" with every item (`ordered`). With no items, `empty` is "No items yet" plus, unless locked, an "Add the first item" brand button calling `onNewItem(null)`.
- **`!gradingReady`:** render the migration notice, then the same "Checklist" section.

- [ ] **Step 3: Item form**

Apply the `RequirementModal` changes from the Interfaces block. `leafId` state starts at `requirement ? leafOf(grading, requirement.id) ?? "" : (leafIdProp ?? "")`. The request includes `grade_leaf_id` only when `showLeaf && !fileLocally`.

- [ ] **Step 4: Page wiring in `page-client.tsx`**

- `preset` gains `leafId: string | null`, and `addRequirement(topic, skillId, leafId = null)`.
- Pass `GradingTab` `onNewItem={(leaf) => addRequirement(null, null, leaf)}`, `onEditItem={setEditing}` and `onRemoveItem={setRemoving}`.
- The modal gets `grading={gradingDraft.draft}`, `leafId={editing === "new" ? preset.leafId : undefined}` and `fileLocally={isDirty(gradingDraft)}`.
- `onSaved={async (saved, leaf) => { setEditing(null); setGradingDraft((s) => afterItemSaved(s, saved, leaf)); await refresh(); }}`.
- The remove toast stays "Requirement removed".

- [ ] **Step 5: Verify**

Run: `cd web && npx tsc --noEmit && npx eslint "app/faculty/courses/[id]" && npm run -s check:grading && npm run -s check:courses`
Expected: no errors; "All checks passed" from both.

Then a smoke run in demo mode with the scratchpad puppeteer `lib.mjs` (`startDemo`, `go`):
- open `/faculty/courses/d0000018-0000-4000-8000-000000000522?tab=grading`;
- the page text includes "Quiz #1", "Not counted in the grade" and "New item";
- clicking a row's actions then "Edit" opens a dialog showing "Counts toward".

- [ ] **Step 6: Build and commit**

Run the build (exit 0), then:

```bash
git add -- "web/app/faculty/courses/[id]/requirement-row.tsx" "web/app/faculty/courses/[id]/checklist-section.tsx"
git commit "web/app/faculty/courses/[id]/requirement-row.tsx" "web/app/faculty/courses/[id]/checklist-section.tsx" "web/app/faculty/courses/[id]/grading-tab.tsx" "web/app/faculty/courses/[id]/requirement-modal.tsx" "web/app/faculty/courses/[id]/page-client.tsx" -m "feat(courses): checklist items as rows inside the Grading tab"
```

---

### Task 4: Retire the Requirements tab

**Files:**
- Modify: `web/app/faculty/courses/course-tabs.ts`
- Modify: `web/app/faculty/courses/[id]/page-client.tsx`
- Modify: `web/app/faculty/courses/page-client.tsx`
- Modify: `web/app/faculty/courses/[id]/progress-tab.tsx`
- Test: `web/scripts/check-course-progress.ts`

**Interfaces:**
- Produces:
  - `COURSE_TABS = ["progress", "grading", "skills"] as const`;
  - `parseCourseTab("requirements") === "grading"`, and any other unknown value returns `"progress"`.

- [ ] **Step 1: Write the failing checks** in `check-course-progress.ts` (import `COURSE_TABS` and `parseCourseTab` from `'../app/faculty/courses/course-tabs'`):

```ts
console.log('course tabs');
eq('three tabs', COURSE_TABS, ['progress', 'grading', 'skills']);
eq('old Requirements links open Grading', parseCourseTab('requirements'), 'grading');
eq('unknown tabs open Progress', parseCourseTab('nope'), 'progress');
eq('Grading', parseCourseTab('grading'), 'grading');
```

- [ ] **Step 2: Run, expecting failure**

Run: `cd web && npm run -s check:courses`
Expected: FAIL "three tabs" and "old Requirements links open Grading".

- [ ] **Step 3: Implement**

- **`course-tabs.ts`:** the new tab list; `parseCourseTab` maps `"requirements"` to `"grading"` before the includes check.
- **`[id]/page-client.tsx`:**
  - Three tabs (Progress, Grading with `count: requirements.length`, Skills).
  - Grading's tab-bar action is `{ icon: faPlus, text: "Add item", label: locked ? "The term has ended, so the checklist is locked" : "Add an item to the checklist", onClick: () => addRequirement(), disabled: !offering || locked }`.
  - Delete the Requirements panel, `RequirementRowView`, `move`, and the now-unused imports (`reorderRequirements`, `faArrowUp`, `faArrowDown`, `groupByTopic`, `TopicIcon`, …).
  - Grading's loading state renders `ChecklistSkeleton` instead of `SkeletonProgressGrid`.
- **`courses/page-client.tsx`:** `TAB_ICON` and `TAB_LABEL` drop `requirements`, and the item-count badge moves to `t === "grading"`. The "Set up the checklist" next step uses `tab: "grading" as const`.
- **`progress-tab.tsx`:** remove the `onOpenRequirements` prop; its three uses call `onOpenGrading`. The page stops passing it.

- [ ] **Step 4: Verify**

Run: `cd web && npm run -s check:courses && npm run -s check:grading && npx tsc --noEmit && npx eslint app/faculty/courses`
Expected: "All checks passed" from both, and no errors.

- [ ] **Step 5: Build and commit**

Run the build (exit 0), then:

```bash
git commit web/app/faculty/courses/course-tabs.ts "web/app/faculty/courses/[id]/page-client.tsx" web/app/faculty/courses/page-client.tsx "web/app/faculty/courses/[id]/progress-tab.tsx" web/scripts/check-course-progress.ts -m "feat(courses): the Requirements tab folds into Grading"
```

---

### Task 5: Demo browser pass

**Files:**
- Scripts only, in the scratchpad (`pp/lib.mjs` helpers). Fix anything found in the owning file.

- [ ] **Step 1: Run the pass** with puppeteer-core and Firefox, in demo mode as Instructor. NCM 103 is `…0522`, NCM 101 `…0521`, and the past NCM 101 `…0523`.

Each line names what to check and the expected result.

1. **`/faculty/courses/…0522?tab=requirements`:** the URL's tab reads Grading; the tab bar shows exactly Progress, Grading and Skills; and the Grading count equals the number of items.
2. **Rows render inside components**, with "Return Demonstration #1" visible. The Progress tab header reads "Return Demonstrations".
3. **New item into an unsaved component:**
   1. In "Written Exams", Add component "Practical", then set the weights Midterm 10 / Quizzes 10 / Practical 10.
   2. Click that component's "+ New item", choose Written Exam, title "Practical exam", and save.
   3. The row appears under Practical and the bar reads "Unsaved changes".
   4. Save. Reload: it's still under Practical.
4. **Same flow, Discard instead of Save:** the new item is listed under "Not counted in the grade".
5. **Remove an item while the split is dirty:**
   1. Change a weight pair, e.g. Midterm 20 / Quizzes 10.
   2. Remove "Quiz #1" from its menu.
   3. Save. Expect "Grading split saved", and no "split changed" error.
6. **Edit an item into Attendance while dirty:** edit "Patient Case #1" into a Count of shifts attended. It moves to "Not counted" with the note, and Save succeeds.
7. **"Stop counting"** moves a row to "Not counted", and Save stores it.
8. **No split:** after "Clear split", the "Checklist" section lists every item and "New item" works.
9. **Past course `…0523?tab=grading`:** there is no `button` whose label contains "Actions for", "New item", "Existing item", "Add part" or "Remove". The tab bar's "Add item" is disabled.
10. **Split editor unavailable:** use `evaluateOnNewDocument` to wrap `fetch` so `/api/faculty/courses/…0522` responses get `grading_ready: false`. The migration notice shows, and the "Checklist" section lists items with "New item".
11. **390px wide:** `document.documentElement.scrollWidth <= innerWidth` on Grading. Also check dark mode (add the `dark` class) and take screenshots of both.

- [ ] **Step 2: Fix and commit**

For each failure: fix it in the owning file, re-run that line and the Task 4 verification, then commit by path with a `fix(courses): …` message. If nothing failed, there's nothing to commit. Record what ran in the ledger.
