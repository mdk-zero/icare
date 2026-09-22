-- =================================================================
-- 044: Sub-task checklists under scenario tasks, rated one by one.
--
-- A scenario task such as "Measure Blood Pressure Manually (Skill 1-7)"
-- is several things a student can do well or badly: seat the patient,
-- place the cuff, estimate the systolic by palpation, deflate at the
-- right rate. The Taylor's skill checklists grade at that level: one
-- row per step, a checkmark per column. This gives each task an
-- ordered list of sub-tasks (steps), each citing the checklist steps it
-- condenses, and lets faculty rate every sub-task on the same verbal
-- scale as 043:
--
--   excellent 10 · very_good 9 · good 8 · fair 7
--   needs_improvement 5 · not_performed 0      (points per sub-task)
--
-- (The points live in the app, web/app/lib/task-ratings.ts, not here.)
--
-- A task with rated sub-tasks earns the average of their points as its
-- share of the task's weight; an unrated sub-task earns nothing. A task
-- whose sub-tasks are all unrated scores exactly as before (its
-- scenario_task_completions row and 043 rating), so assignments graded
-- before this migration keep their scores. Tasks without sub-tasks are
-- rated as a whole, as before.
--
-- Once any sub-task is rated, the app also stores the task's overall
-- level on its completion row (043's rating), so the readers that only
-- know about tasks (the student's task list, ward progress, tips) keep
-- working.
-- =================================================================

-- -----------------------------------------------------------------
-- Sub-tasks (per scenario task)
-- -----------------------------------------------------------------
create table if not exists public.scenario_task_steps (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.scenario_tasks(id) on delete cascade,
  title text not null,
  -- where the step comes from, e.g. 'Skill 1-7, steps 12-15'
  source text not null default '',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_scenario_task_steps_task on public.scenario_task_steps(task_id);

alter table public.scenario_task_steps enable row level security;

drop policy if exists "read scenario task steps" on public.scenario_task_steps;
create policy "read scenario task steps" on public.scenario_task_steps
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('student', 'faculty', 'admin')
    )
  );

drop policy if exists "faculty manage scenario task steps" on public.scenario_task_steps;
create policy "faculty manage scenario task steps" on public.scenario_task_steps
  for all using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

-- -----------------------------------------------------------------
-- Per-assignment sub-task ratings (a row means the sub-task is rated)
-- -----------------------------------------------------------------
create table if not exists public.scenario_task_step_ratings (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.scenario_assignments(id) on delete cascade,
  step_id uuid not null references public.scenario_task_steps(id) on delete cascade,
  rating text not null,
  rated_by uuid references public.users(id) on delete set null,
  rated_at timestamptz not null default now(),
  unique (assignment_id, step_id),
  constraint scenario_task_step_ratings_rating_ck check (
    rating in ('excellent', 'very_good', 'good', 'fair', 'needs_improvement', 'not_performed')
  )
);

create index if not exists idx_stsr_assignment on public.scenario_task_step_ratings(assignment_id);
create index if not exists idx_stsr_step on public.scenario_task_step_ratings(step_id);

alter table public.scenario_task_step_ratings enable row level security;

drop policy if exists "student reads own step ratings" on public.scenario_task_step_ratings;
create policy "student reads own step ratings" on public.scenario_task_step_ratings
  for select using (
    exists (
      select 1 from public.scenario_assignments sa
      where sa.id = scenario_task_step_ratings.assignment_id
        and sa.student_id = auth.uid()
    )
  );

drop policy if exists "faculty manage step ratings" on public.scenario_task_step_ratings;
create policy "faculty manage step ratings" on public.scenario_task_step_ratings
  for all using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );
