-- =================================================================
-- 024: Per-scenario tasks with automatic + faculty-verified checkoff
--
-- Scenarios gain a real, faculty-authored task list (replacing the hardcoded
-- 8-item checklist the runners toggled in local state). Each task is either:
--
--   * verification = 'system'  -> checked off automatically when the student
--     performs the matching in-app action (system_trigger):
--        'vitals'   -> records a vital-sign reading for the scenario's patient
--        'charting' -> charts a TPR/IVF/progress-note for that patient
--   * verification = 'faculty' -> performed outside the system (physical exam,
--     administering medication, ...) and checked off by faculty on the web.
--
-- Completion flow: the student submits their part (submitted_at), then faculty
-- finish their check-offs and finalize, which locks the score (finalized_by).
-- =================================================================

-- -----------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------
do $$ begin
  create type scenario_task_category as enum (
    'assessment', 'intervention', 'medication', 'communication', 'documentation'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type scenario_task_verification as enum ('system', 'faculty');
exception when duplicate_object then null; end $$;

do $$ begin
  create type scenario_task_trigger as enum ('vitals', 'charting');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------
-- Task templates (per scenario)
-- -----------------------------------------------------------------
create table if not exists public.scenario_tasks (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  title text not null,
  description text not null default '',
  category scenario_task_category not null default 'assessment',
  points int not null default 10 check (points >= 0),
  verification scenario_task_verification not null default 'faculty',
  -- which student action auto-completes it; null for faculty-verified tasks
  system_trigger scenario_task_trigger,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  -- a system task must name its trigger; a faculty task must not
  constraint scenario_tasks_trigger_ck check (
    (verification = 'system' and system_trigger is not null)
    or (verification = 'faculty' and system_trigger is null)
  )
);

create index if not exists idx_scenario_tasks_scenario on public.scenario_tasks(scenario_id);
create index if not exists idx_scenario_tasks_trigger on public.scenario_tasks(system_trigger);

alter table public.scenario_tasks enable row level security;

drop policy if exists "read scenario tasks" on public.scenario_tasks;
create policy "read scenario tasks" on public.scenario_tasks
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('student', 'faculty', 'admin')
    )
  );

drop policy if exists "faculty manage scenario tasks" on public.scenario_tasks;
create policy "faculty manage scenario tasks" on public.scenario_tasks
  for all using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

-- -----------------------------------------------------------------
-- Per-assignment completion (a row means the task is done)
-- -----------------------------------------------------------------
create table if not exists public.scenario_task_completions (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.scenario_assignments(id) on delete cascade,
  task_id uuid not null references public.scenario_tasks(id) on delete cascade,
  completed_by uuid references public.users(id) on delete set null,
  completed_via scenario_task_verification not null,
  completed_at timestamptz not null default now(),
  unique (assignment_id, task_id)
);

create index if not exists idx_stc_assignment on public.scenario_task_completions(assignment_id);
create index if not exists idx_stc_task on public.scenario_task_completions(task_id);

alter table public.scenario_task_completions enable row level security;

drop policy if exists "student reads own task completions" on public.scenario_task_completions;
create policy "student reads own task completions" on public.scenario_task_completions
  for select using (
    exists (
      select 1 from public.scenario_assignments sa
      where sa.id = scenario_task_completions.assignment_id
        and sa.student_id = auth.uid()
    )
  );

drop policy if exists "faculty reads task completions" on public.scenario_task_completions;
create policy "faculty reads task completions" on public.scenario_task_completions
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop policy if exists "faculty manage task completions" on public.scenario_task_completions;
create policy "faculty manage task completions" on public.scenario_task_completions
  for all using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

-- -----------------------------------------------------------------
-- Assignment: student submission + faculty finalization
-- -----------------------------------------------------------------
alter table public.scenario_assignments
  add column if not exists submitted_at timestamptz,
  add column if not exists finalized_by uuid references public.users(id) on delete set null;

-- -----------------------------------------------------------------
-- Backfill: give every existing scenario the classic classified checklist so
-- current assignments keep working. Faculty can edit these afterwards.
-- -----------------------------------------------------------------
insert into public.scenario_tasks
  (scenario_id, title, description, category, points, verification, system_trigger, sort_order)
select s.id, t.title, t.description,
       t.category::scenario_task_category, t.points,
       t.verification::scenario_task_verification,
       t.system_trigger::scenario_task_trigger, t.sort_order
from public.scenarios s
cross join (values
  ('Assess Patient Vital Signs', 'Measure heart rate, blood pressure, temperature, and respiratory rate', 'assessment', 10, 'system', 'vitals', 1),
  ('Review Medical History', 'Check the patient''s allergies, current medications, and past conditions', 'assessment', 10, 'faculty', null, 2),
  ('Perform Physical Examination', 'Conduct a head-to-toe physical assessment', 'assessment', 15, 'faculty', null, 3),
  ('Administer Medication', 'Give the prescribed medication with proper technique', 'medication', 15, 'faculty', null, 4),
  ('Develop Care Plan', 'Create a nursing care plan based on patient needs', 'intervention', 15, 'faculty', null, 5),
  ('Document Assessment', 'Accurately document findings in the patient chart', 'documentation', 10, 'system', 'charting', 6),
  ('Communicate with Patient', 'Explain the procedure and provide health education', 'communication', 10, 'faculty', null, 7),
  ('Notify Healthcare Team', 'Report significant findings to the physician', 'communication', 15, 'faculty', null, 8)
) as t(title, description, category, points, verification, system_trigger, sort_order)
where not exists (
  select 1 from public.scenario_tasks st where st.scenario_id = s.id
);
