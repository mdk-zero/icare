-- =================================================================
-- 071: "N/A" on the Patient Case grading checklist.
--
-- Taylor's checklists are written for practice abroad, and some of their
-- steps aren't done in the Philippines. Faculty can now mark a sub-task
-- (or a task graded as a whole) Not Applicable next to Excellent /
-- Satisfactory / Needs Practice.
--
-- An N/A row is left out of the score entirely: it adds nothing to the
-- points earned or to the points possible. A task whose every row is N/A
-- drops out of the scenario's grade, and the other tasks' weights fill
-- its share (the scoring lives in web/app/lib/task-ratings.ts).
--
-- Case presentation ratings (056) are not touched: N/A is for the
-- scenario checklist only.
--
-- Additive: every existing rating stays valid. Re-running is safe.
-- =================================================================

alter table public.scenario_task_completions
  drop constraint if exists scenario_task_completions_rating_ck;

alter table public.scenario_task_completions
  add constraint scenario_task_completions_rating_ck check (
    rating is null or rating in ('excellent', 'satisfactory', 'needs_practice', 'not_applicable')
  );

alter table public.scenario_task_step_ratings
  drop constraint if exists scenario_task_step_ratings_rating_ck;

alter table public.scenario_task_step_ratings
  add constraint scenario_task_step_ratings_rating_ck check (
    rating in ('excellent', 'satisfactory', 'needs_practice', 'not_applicable')
  );
