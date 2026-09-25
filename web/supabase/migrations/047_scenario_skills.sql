-- =================================================================
-- 047: Scenario tasks built from Taylor's skills.
--
-- A scenario's tasks are now the Taylor's skills it calls for: one task
-- per skill, whose sub-tasks are that skill's checklist steps word for
-- word (045). The links make that explicit instead of leaving it to the
-- "(Skill 1-7)" in a title:
--
--   scenario_tasks.skill_id            the skill the task is
--   scenario_task_steps.skill_step_id  the checklist step a sub-task is
--
-- Both are nullable: tasks written by hand, and the auto-tracked ones,
-- have no skill. A catalog step is never deleted while a sub-task points
-- at it (restrict); re-seeding the catalog updates steps in place.
-- =================================================================

alter table public.scenario_tasks
  add column if not exists skill_id text references public.taylor_skills(id) on delete set null;

create index if not exists idx_scenario_tasks_skill on public.scenario_tasks(skill_id);

alter table public.scenario_task_steps
  add column if not exists skill_step_id uuid references public.taylor_skill_steps(id) on delete restrict;

create index if not exists idx_scenario_task_steps_skill_step on public.scenario_task_steps(skill_step_id);
