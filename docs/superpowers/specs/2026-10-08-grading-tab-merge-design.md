# Grading tab absorbs the checklist; Skill items become Return Demonstrations

## Context

A course offering's page has four tabs: Progress, Requirements (the checklist, grouped by kind), Skills (the course's skill list) and Grading (the weighted split from the 2026-10-06 course grading design). The Grading tab already files checklist items into parts and components, so instructors look at the same items in two places and add items in one but weigh them in the other. The instructor asked for the Grading tab to replace the Requirements tab, carrying over what Requirements does.

The checklist's **Skill** items are met by graded Patient Case tasks and Quizzes on one of the course's skills. In nursing school terms that is a **return demonstration**, so the instructor asked for the items to be renamed. Meanwhile the hand-scored **Lab Activity** kind's hint and some demo titles use "return demonstration" for hand-scored work, which would collide with the new name.

Decisions agreed in brainstorming on 2026-10-08:
- **Rename only.** Skill items keep scoring as now, from Patient Case tasks and Quizzes.
- **Layout:** items sit inside the split. Each component lists its items as full rows, and a bottom section holds items that don't count.
- **The merged tab is called "Grading".**
- **Item changes during unsaved split edits:** the item saves at once and the draft follows.

## 1. Rename (UI only)

Code names stay unchanged: `kind: 'skill'`, the topic key `skill` and the column names all stay.

- **Item names** (`web/app/lib/course-progress.ts`): `TOPIC.skill` changes from `'Skill'` to `'Return Demonstration'`, so names read "Return Demonstration #1". Every place that names items through `requirementNames` follows: the Progress grid, Grading chips, the student detail Requirements tab, the item picker, and the mobile app, whose labels come from the server.
- **What an item asks for** (`requirementLabel`) is unchanged: "Skill 1-7 · Assessing Brachial Artery Blood Pressure (satisfactory or better)". Here "Skill" names the catalog skill, not the item kind.
- **Section label** (`web/app/faculty/courses/topics.tsx`): the `skill` topic's label becomes **"Return Demonstrations"**. The blurb becomes "Met by graded Patient Case tasks or Quizzes on the skill".
- **Item form** (`[id]/requirement-modal.tsx`):
  - The kind card "Skill" becomes **"Return Demonstration"**, with the hint "A course skill, met by graded Patient Case tasks or Quizzes on it".
  - Lab Activity's hint becomes "Hands-on work you score yourself, like a lab report or a skills-lab check-off".
  - Any other user-facing "Skill requirement" wording in the form follows the rename.
- **Skills tab** (`[id]/skills-tab.tsx`): the tab keeps its name. Copy that says "Skill requirements" becomes "Return Demonstrations", e.g. "Return Demonstrations choose from this list". "Add to checklist" still adds the item.
- **Demo** (`web/app/lib/demo/fixtures/courses.ts`). The hand-scored items stop being called return demonstrations:
  - NCM 101: "Head-to-toe assessment return demonstration, signed by the clinical instructor" becomes "Head-to-toe assessment check-off, signed by the clinical instructor".
  - NCM 103: "Oxygen therapy return demonstration (nasal cannula and face mask)" becomes "Oxygen therapy check-off (nasal cannula and face mask)".
  - Last term's NCM 101: "Vital signs return demonstration" becomes "Vital signs check-off", and "Head-to-toe assessment return demonstration" becomes "Head-to-toe assessment check-off".
  - Grading components: NCM 101's "Return demonstrations" (hand-scored) becomes "Lab check-offs", and its "Skills" becomes "Return demonstrations". Last term's "Return demonstrations" becomes "Lab check-offs".
  - NCM 103's "Lab reports" and "Individual performance" stay.
  - `signOff()` looks items up by title, so its calls take the new titles.

## 2. Tabs and navigation

- **Tab list** (`web/app/faculty/courses/course-tabs.ts`): `COURSE_TABS` becomes `["progress", "grading", "skills"]`. `parseCourseTab("requirements")` returns `"grading"`, so old links and bookmarks land on Grading. Anything else unknown still returns `"progress"`.
- **Course page** (`[id]/page-client.tsx`):
  - Three tabs. The Grading tab's count is the number of checklist items (previously the number of parts) and its icon stays `faPercent`.
  - The tab-bar action on Grading is **"Add item"**, which opens the item form with "Counts toward" set to "Not counted". It is disabled when locked, with the existing lock label.
  - The Requirements panel and its skeleton are removed. The skeleton moves to Grading's loading state.
- **Course cards** (`web/app/faculty/courses/page-client.tsx`):
  - `TAB_ICON` and `TAB_LABEL` drop `requirements`, so the card's quick links are Progress, Grading and Skills.
  - The "Set up the checklist" next step points at `grading`.
  - The checklist count badge moves from the Requirements link to the Grading link.
- **Progress tab** (`[id]/progress-tab.tsx`): both "Set up the checklist" buttons open Grading. `onOpenRequirements` goes away and those buttons use `onOpenGrading`.
- **Breadcrumb switcher** (`[id]/course-crumbs.tsx`) keeps the current tab through `courseTabHref`, and needs no change beyond the type.

## 3. The merged Grading tab

Top to bottom, when a split exists:

1. **Final grade card:** unchanged (split bar, total check, legend, explanation).
2. **Part cards**, unchanged headers (color square, name, percent, remove). Inside, each component row keeps its name, percent and remove controls, and its items are **full rows** instead of chips. A part with no components holds its rows directly.
   - **Row:**
     - the kind's icon tile from `topics.tsx`;
     - the item name ("Quiz #1") in semibold;
     - below it, `requirementDetail(r)` in gray;
     - the rose "The linked activity was deleted" badge when `r.removed`;
     - on the right, unless locked, an `ActionsMenu` with **Edit** (opens the item form), **Stop counting** (unfiles it in the draft, like a chip's ×) and **Remove** (the existing confirm modal and delete).
   - **Under each leaf's rows:**
     - **+ New item** opens the item form with "Counts toward" set to that leaf;
     - **+ Existing item** opens today's `GradingItemPicker` and appears only when unfiled gradeable items exist;
     - "No items yet" when the leaf is empty and locked.
   - Inside a leaf, rows are ordered by `inTopicOrder` (kind, then checklist position).
3. **"Not counted in the grade"** section: full rows for unfiled gradeable items, then attendance items, each marked "No score, so it can't count". **+ New item** opens the form with "Not counted". The section shows only when it has items or the tab is editable.

Other states:
- **No split:**
  - The existing "No grading split yet" card with its preset and blank buttons.
  - Below it, every item in a section headed **"Checklist"** (the same rows), with **+ New item**.
  - With no items either, the section shows "No items yet" and an **Add the first item** button.
- **Locked (ended term):**
  - The existing lock notice.
  - Rows have no menu, and there are no add, remove or move-in buttons.
  - The split stays read-only, as now.
- **067 not applied** (`grading_ready: false`): the migration notice replaces the split editor. The checklist section still lists every item with add, edit and remove working, as on the Requirements tab before 067.

Removed: the Requirements tab's ↑↓ move arrows and the reorder calls the page made for them. Numbering keeps following checklist position, which is creation order unless reordered earlier. The reorder API route stays.

Files:
- **New `[id]/requirement-row.tsx`:** the row view, moved out of `page-client.tsx`'s `RequirementRowView` and adapted.
- **New `[id]/checklist-section.tsx`:** a titled section of rows with its add buttons, used for the "Not counted" and "Checklist" sections.
- **`grading-tab.tsx`** renders leaves with `RequirementRow` instead of chips, keeping split editing.

## 4. Item changes and the unsaved split

The page (`[id]/page-client.tsx`) owns the item form, the remove confirm and the grading draft, and passes the Grading tab callbacks: `onNewItem(leafId|null)`, `onEditItem(r)` and `onRemoveItem(r)`.

- **"Counts toward" options** come from the **draft** (`gradingLeaves(draft)`), not the stored split, so unsaved components are offered. The form receives the draft split and an initial leaf.
- **Saving an item while the draft is clean:** as today, the request carries `grade_leaf_id`, the server files the item into the stored split, and the refetch brings the new split, which `followServer` adopts.
- **Saving an item while the draft is dirty:** the request **omits** `grade_leaf_id`, so the server leaves the stored split alone (except that an item turned into attendance is unfiled there, as today). On success the page applies `refile(draft, savedRow, leaf)` to the draft. The item shows in its component, the bar reads "Unsaved changes", and the next Save stores it. Discarding the draft leaves the item unfiled.
- **Removing an item** goes as today: the server deletes the row and unfiles it from the stored split. A dirty draft keeps its edits; the removed id drops out through `dropUnknown`.
- **The stale-split check survives item changes.** `GradingDraft` gains `from: GradingSplit | null`, the stored split the edits started from. It is set by `startDraft` and `savedDraft`, and by `followServer` when it adopts a server split.
  - A save sends `base = gradingSignature(settle(from, requirements))`, where the new pure `settle(split, requirements)` in `course-grading.ts` unfiles every id that is no longer on the checklist or no longer gradeable. That is exactly what the server's item routes did to the stored copy, so the save's `base` matches the stored split and isn't refused.
  - A change from another tab or device still makes them differ, so the save gets the existing 409 `GRADING_CHANGED` and the Reload prompt.
  - `isDirty` keeps comparing the draft with the split it started from. The `base` field becomes `gradingSignature(from)`, kept for dirty checks.
- **No API, route or database change.** The demo handlers already behave the same: a missing `grade_leaf_id` leaves the split alone, and removal unfiles.

## 5. Verification

- **`npm run check:grading`** gains:
  - `settle` drops removed and attendance ids and leaves the rest in order;
  - after an item is removed server-side, a dirty draft's save `base` equals the server's new signature;
  - a change made elsewhere still differs;
  - `refile` on a dirty draft files a new item into an unsaved component;
  - `startDraft`, `followServer` and `savedDraft` set `from`.
- **`npm run check:courses`** gains:
  - Skill items are named "Return Demonstration #N";
  - `parseCourseTab('requirements') === 'grading'`;
  - `COURSE_TABS` is progress, grading, skills.
- **The demo fixture checks** in `check:grading` still pass with the renamed titles, every course still files every gradeable item, and the ended course's grades are still complete.
- **Build:** `npx tsc --noEmit`, then `NEXT_DIST_DIR=.next-build npm run build` beside the running dev server.
- **Demo browser pass** (puppeteer-core with Firefox):
  - three tabs, and `?tab=requirements` opening Grading;
  - rows with menus inside components;
  - adding a component, then **+ New item** into it before saving, then Save, with the item filed;
  - removing an item while the split has unsaved edits, then Save, which is accepted;
  - "Stop counting" moving a row to "Not counted";
  - the no-split "Checklist" view;
  - the ended term read-only;
  - 390px with no horizontal overflow;
  - dark mode;
  - the Progress grid showing "Return Demonstrations" / "Return Demonstration #1".

## Phases

Each phase is committed by path on main after a green typecheck and build, with no push.

1. **Rename:** labels, the form copy, the Skills tab copy, demo titles and components, and the check updates.
2. **Merged tab:** the tab list and links, the row and section components, Grading rendering rows, the page wiring, and the draft `from`/`settle` logic with its checks.
3. **Browser pass and fixes.**
