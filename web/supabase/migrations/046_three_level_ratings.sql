-- =================================================================
-- 046: Scenario grading on the Taylor's checklist scale, with rubrics.
--
-- 043/044 graded tasks and sub-tasks on six levels (Excellent … Not
-- Performed). The Taylor's skill checklists every scenario is built
-- from have three columns, and grading now uses exactly those:
--
--   excellent 100% · satisfactory 75% · needs_practice 50%
--
-- (the points live in web/app/lib/task-ratings.ts). A step or task
-- nobody rated earns nothing, so "not performed" is no longer a level:
-- it is the absence of a rating.
--
-- Existing ratings are remapped:
--   excellent                 -> excellent
--   very_good, good           -> satisfactory
--   fair, needs_improvement   -> needs_practice
--   not_performed             -> unrated (the row is deleted)
--
-- A deleted "not performed" completion row scores 0, as it did. (An
-- unrated completion row that remains would score full credit, which is
-- why it is deleted rather than set to null.)
--
-- scenarios.rubric: faculty's own wording for what each level means on
-- this scenario, {excellent, satisfactory, needs_practice}; a missing
-- or blank key falls back to the book's definition in the app.
-- =================================================================

-- -----------------------------------------------------------------
-- Task completions
-- -----------------------------------------------------------------
alter table public.scenario_task_completions
  drop constraint if exists scenario_task_completions_rating_ck;

delete from public.scenario_task_completions where rating = 'not_performed';

update public.scenario_task_completions
set rating = case rating
  when 'very_good' then 'satisfactory'
  when 'good' then 'satisfactory'
  when 'fair' then 'needs_practice'
  when 'needs_improvement' then 'needs_practice'
  else rating
end
where rating in ('very_good', 'good', 'fair', 'needs_improvement');

alter table public.scenario_task_completions
  add constraint scenario_task_completions_rating_ck check (
    rating is null or rating in ('excellent', 'satisfactory', 'needs_practice')
  );

-- -----------------------------------------------------------------
-- Sub-task ratings
-- -----------------------------------------------------------------
alter table public.scenario_task_step_ratings
  drop constraint if exists scenario_task_step_ratings_rating_ck;

delete from public.scenario_task_step_ratings where rating = 'not_performed';

update public.scenario_task_step_ratings
set rating = case rating
  when 'very_good' then 'satisfactory'
  when 'good' then 'satisfactory'
  when 'fair' then 'needs_practice'
  when 'needs_improvement' then 'needs_practice'
  else rating
end
where rating in ('very_good', 'good', 'fair', 'needs_improvement');

alter table public.scenario_task_step_ratings
  add constraint scenario_task_step_ratings_rating_ck check (
    rating in ('excellent', 'satisfactory', 'needs_practice')
  );

-- -----------------------------------------------------------------
-- Per-scenario rubric
-- -----------------------------------------------------------------
alter table public.scenarios
  add column if not exists rubric jsonb;

do $$ begin
  alter table public.scenarios
    add constraint scenarios_rubric_ck check (rubric is null or jsonb_typeof(rubric) = 'object');
exception when duplicate_object then null; end $$;
