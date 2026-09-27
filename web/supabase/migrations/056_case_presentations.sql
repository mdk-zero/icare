-- =================================================================
-- 056: Hospital case presentations.
--
-- RetDem is a skills demonstration, not patient monitoring, so students
-- no longer chart vitals/TPR/IVF on the simulated ward. What instructors
-- actually assign is a case presentation: each student writes up the
-- most interesting patient from their hospital duty and presents it.
--
-- These are real patients, so the record is anonymised by construction:
-- the patient is named by initials only ("Juan Dela Cruz" -> "JD"),
-- enforced here as well as in the API, and there is deliberately no
-- column for a name, hospital record number, birthdate or photo. Age is
-- a number, not a date.
--
-- Kept apart from public.patients on purpose: a hospital case is not a
-- ward admission, and must never reach the floor plan, vitals alerts,
-- the ML features or the warehouse.
--
-- One submission row per student, created when faculty assign the
-- presentation to their sections (not on the student's first save), so
-- the roster can show who has not started.
-- =================================================================

do $$ begin
  create type case_submission_status as enum ('not_started', 'draft', 'submitted', 'graded');
exception when duplicate_object then null; end $$;

create table if not exists public.case_presentations (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  instructions text not null default '',
  deadline timestamptz,
  -- The sections it was given to; the per-student rows are the assignment.
  section_ids uuid[] not null default '{}',
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.case_submissions (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.case_presentations(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  status case_submission_status not null default 'not_started',

  -- The patient, anonymised: initials only, age in years.
  patient_initials text check (patient_initials ~ '^[A-Z]{2,4}$'),
  age int check (age between 0 and 130),
  sex user_sex,
  hospital text not null default '',
  ward text not null default '',

  admitting_diagnosis text not null default '',
  chief_complaint text not null default '',
  history text not null default '',
  medications text not null default '',
  nursing_diagnoses text not null default '',
  interventions text not null default '',

  -- What the student observed on duty: { vitals: [], tpr: [], ivf: [] },
  -- each entry shaped like the ward forms. The API whitelists the keys.
  observations jsonb not null default '{"vitals":[],"tpr":[],"ivf":[]}'::jsonb,

  submitted_at timestamptz,
  graded_by uuid references public.users(id) on delete set null,
  graded_at timestamptz,
  score numeric(5,2),
  remarks text not null default '',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (presentation_id, student_id)
);

create index if not exists idx_case_submissions_student
  on public.case_submissions(student_id);

-- One row per rubric criterion (keys live in app/lib/case-rubric.ts), on
-- the same three-level scale as scenario tasks since 046.
create table if not exists public.case_submission_ratings (
  submission_id uuid not null references public.case_submissions(id) on delete cascade,
  criterion text not null,
  rating text not null check (rating in ('excellent', 'satisfactory', 'needs_practice')),
  remarks text not null default '',
  rated_by uuid references public.users(id) on delete set null,
  rated_at timestamptz not null default now(),
  primary key (submission_id, criterion)
);

alter table public.case_presentations enable row level security;
alter table public.case_submissions enable row level security;
alter table public.case_submission_ratings enable row level security;

-- Written through the service-role API routes, which have already
-- established who is asking; these policies are defence in depth.
drop policy if exists "faculty and admin can read case presentations" on public.case_presentations;
create policy "faculty and admin can read case presentations" on public.case_presentations
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop policy if exists "students read own case submissions" on public.case_submissions;
create policy "students read own case submissions" on public.case_submissions
  for select using (student_id = auth.uid());

-- A handed-in case is frozen: only an unsubmitted one can be edited.
drop policy if exists "students edit own unsubmitted case" on public.case_submissions;
create policy "students edit own unsubmitted case" on public.case_submissions
  for update
  using (student_id = auth.uid() and status in ('not_started', 'draft'))
  with check (student_id = auth.uid() and status in ('not_started', 'draft'));

drop policy if exists "faculty and admin can read case submissions" on public.case_submissions;
create policy "faculty and admin can read case submissions" on public.case_submissions
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop policy if exists "students read own case ratings" on public.case_submission_ratings;
create policy "students read own case ratings" on public.case_submission_ratings
  for select using (
    exists (
      select 1 from public.case_submissions s
      where s.id = case_submission_ratings.submission_id
        and s.student_id = auth.uid()
    )
  );

drop policy if exists "faculty and admin can read case ratings" on public.case_submission_ratings;
create policy "faculty and admin can read case ratings" on public.case_submission_ratings
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop trigger if exists trg_case_presentations_updated_at on public.case_presentations;
create trigger trg_case_presentations_updated_at
  before update on public.case_presentations
  for each row execute function public.set_updated_at();

drop trigger if exists trg_case_submissions_updated_at on public.case_submissions;
create trigger trg_case_submissions_updated_at
  before update on public.case_submissions
  for each row execute function public.set_updated_at();

comment on table public.case_submissions is
  'A student''s write-up of a real hospital-duty patient, identified by initials only. One row per student per presentation, created at assignment.';
