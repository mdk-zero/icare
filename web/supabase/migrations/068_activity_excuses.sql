-- =================================================================
-- 068: Excused absences from activities.
--
-- Attendance no longer comes from shifts. Every RetDem (patient case),
-- Quiz and Case Presentation a student is given has a deadline: doing
-- the work by it is Present, after it Late, and nothing by then Absent.
-- That is worked out on every read (web/app/lib/attendance.ts), so the
-- only thing stored is an instructor excusing an absence, with a reason.
--
-- activity_id is the scenario assignment, the assessment assignment, or
-- the case presentation (one per student through student_id), so it has
-- no foreign key. An excuse for an activity that was deleted is never
-- matched and does no harm.
--
-- The shifts and shift_assignments tables are left as they are: the app
-- stops reading them, and their history stays.
-- =================================================================

create table if not exists public.activity_excuses (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  activity_kind text not null check (activity_kind in ('scenario', 'assessment', 'case_presentation')),
  activity_id uuid not null,
  reason text not null check (char_length(btrim(reason)) between 1 and 300),
  excused_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (activity_kind, activity_id, student_id)
);

create index if not exists idx_activity_excuses_student on public.activity_excuses(student_id);

-- Read and written only by the server (service role), like 065's tables.
alter table public.activity_excuses enable row level security;
