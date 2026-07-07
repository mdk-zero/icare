-- =================================================================
-- Scenarios, faculty-student roster, and scenario assignments
-- =================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------
do $$ begin
  create type scenario_difficulty as enum ('beginner', 'intermediate', 'advanced');
exception when duplicate_object then null; end $$;

do $$ begin
  create type scenario_category as enum (
    'Cardiac Emergency',
    'Respiratory Emergency',
    'Neurological Emergency',
    'Trauma',
    'Medical-Surgical',
    'Patient Education',
    'Infection Management',
    'Critical Care',
    'Medication Safety',
    'General'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type scenario_assignment_status as enum ('pending', 'in_progress', 'completed', 'overdue');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------
-- Faculty-student roster (junction table)
-- -----------------------------------------------------------------
create table if not exists public.faculty_students (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.users(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (faculty_id, student_id)
);

create index if not exists idx_faculty_students_faculty_id on public.faculty_students(faculty_id);
create index if not exists idx_faculty_students_student_id on public.faculty_students(student_id);

alter table public.faculty_students enable row level security;

drop policy if exists "faculty can read own roster" on public.faculty_students;

create policy "faculty can read own roster" on public.faculty_students
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

-- -----------------------------------------------------------------
-- Scenarios
-- -----------------------------------------------------------------
create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.users(id) on delete set null,
  title text not null,
  description text not null default '',
  difficulty scenario_difficulty not null,
  category scenario_category not null,
  patient_case jsonb not null default '{}'::jsonb,
  learning_objectives jsonb not null default '[]'::jsonb,
  is_ai_generated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_scenarios_created_by on public.scenarios(created_by);
create index if not exists idx_scenarios_difficulty on public.scenarios(difficulty);
create index if not exists idx_scenarios_category on public.scenarios(category);

alter table public.scenarios enable row level security;

drop policy if exists "authenticated users can read scenarios" on public.scenarios;

create policy "authenticated users can read scenarios" on public.scenarios
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('student', 'faculty', 'admin')
    )
  );

drop policy if exists "faculty and admin can manage own scenarios" on public.scenarios;

create policy "faculty and admin can manage own scenarios" on public.scenarios
  for all using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

-- -----------------------------------------------------------------
-- Scenario assignments
-- -----------------------------------------------------------------
create table if not exists public.scenario_assignments (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.scenarios(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  assigned_by uuid references public.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  deadline timestamptz,
  status scenario_assignment_status not null default 'pending',
  required boolean not null default true,
  completed_at timestamptz,
  score int,
  time_taken int,
  unique (scenario_id, student_id)
);

create index if not exists idx_scenario_assignments_scenario_id on public.scenario_assignments(scenario_id);
create index if not exists idx_scenario_assignments_student_id on public.scenario_assignments(student_id);
create index if not exists idx_scenario_assignments_assigned_by on public.scenario_assignments(assigned_by);
create index if not exists idx_scenario_assignments_status on public.scenario_assignments(status);

alter table public.scenario_assignments enable row level security;

drop policy if exists "students can read own assignments" on public.scenario_assignments;

create policy "students can read own assignments" on public.scenario_assignments
  for select using (
    auth.uid() = student_id
  );

drop policy if exists "faculty and admin can read assignments" on public.scenario_assignments;

create policy "faculty and admin can read assignments" on public.scenario_assignments
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop policy if exists "faculty and admin can manage assignments" on public.scenario_assignments;

create policy "faculty and admin can manage assignments" on public.scenario_assignments
  for all using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

-- -----------------------------------------------------------------
-- Updated-at trigger (reuses existing function)
-- -----------------------------------------------------------------
drop trigger if exists trg_scenarios_updated_at on public.scenarios;
create trigger trg_scenarios_updated_at
  before update on public.scenarios
  for each row execute function public.set_updated_at();
