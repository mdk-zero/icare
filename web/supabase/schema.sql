-- =================================================================
-- iCARE++ Supabase schema
-- Run this once in the Supabase SQL Editor (Project -> SQL -> New query)
-- =================================================================

create extension if not exists pgcrypto;

do $$ begin
  create type user_role as enum ('student', 'faculty', 'admin');
exception when duplicate_object then null; end $$;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  google_sub text unique,
  email text unique not null,
  name text not null,
  picture_url text,
  role user_role not null default 'student',
  password_hash text,
  force_password_change boolean not null default false,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

alter table public.users enable row level security;

-- Users can read their own row (matched via Supabase auth.uid()).
-- Server-side calls use the service role key, which bypasses RLS.
drop policy if exists "users can read own row" on public.users;
create policy "users can read own row" on public.users
  for select using (auth.uid()::text = google_sub);

-- =================================================================
-- Seed data: three test accounts for local development.
-- After running this, also run `npm run db:seed` to insert the
-- matching password hashes (or paste the SQL produced by the script
-- directly into the editor).
-- =================================================================
-- The seed script upserts these rows with bcrypt hashes.
-- Set SEED_ADMIN_PASSWORD, SEED_STUDENT_PASSWORD, and SEED_FACULTY_PASSWORD
-- in your environment before running `npm run db:seed`.

-- =================================================================
-- Password resets (OTP-based)
-- =================================================================

create table if not exists public.password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  otp_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- Index for fast lookup of the latest active reset for a user
create index if not exists idx_password_resets_user_created
  on public.password_resets(user_id, created_at desc);

-- Only service-role/admin operations should touch this table directly.
-- No RLS policy is needed because server-side code bypasses RLS with the
-- service role key, and end users never query it themselves.

-- =================================================================
-- Patients table for MIMIC-IV demo (and eventually full MIMIC-IV) data
-- =================================================================

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  subject_id bigint not null,
  hadm_id bigint,
  name text not null,
  age int,
  gender text,
  room_number text,
  diagnosis text,
  admission_date timestamptz,
  vital_signs jsonb not null default '{}'::jsonb,
  labs jsonb not null default '{}'::jsonb,
  medical_history text,
  mimic_id text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_patients_subject_id on public.patients(subject_id);
create index if not exists idx_patients_hadm_id on public.patients(hadm_id);
create index if not exists idx_patients_mimic_id on public.patients(mimic_id);
create index if not exists idx_patients_created_by on public.patients(created_by);

alter table public.patients
  drop constraint if exists uq_patients_subject_hadm;
alter table public.patients
  add constraint uq_patients_subject_hadm unique (subject_id, hadm_id);

alter table public.patients enable row level security;

drop policy if exists "faculty and students can read patients" on public.patients;

create policy "faculty and students can read patients" on public.patients
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('student', 'faculty', 'admin')
    )
  );

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_patients_updated_at on public.patients;
create trigger trg_patients_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();

-- =================================================================
-- Faculty-student roster
-- =================================================================

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

-- =================================================================
-- Scenarios
-- =================================================================

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

create table if not exists public.scenarios (
  id uuid primary key default gen_random_uuid(),
  created_by uuid references public.users(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
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
create index if not exists idx_scenarios_patient_id on public.scenarios(patient_id);

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

drop trigger if exists trg_scenarios_updated_at on public.scenarios;
create trigger trg_scenarios_updated_at
  before update on public.scenarios
  for each row execute function public.set_updated_at();

-- =================================================================
-- Scenario assignments
-- =================================================================

do $$ begin
  create type scenario_assignment_status as enum ('pending', 'in_progress', 'completed', 'overdue');
exception when duplicate_object then null; end $$;

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
