-- =================================================================
-- 029: Nurse shift scheduling + enforced assessment deadlines
--
-- Two features that share one migration because both fill holes the
-- schema already cut but nothing ever wrote to.
--
-- SHIFTS. A shift is a scheduled block of clinical duty. room_assignments
-- (008) is deliberately left alone: dw.dw_analytics_summary's
-- room_utilization (015, 023) reads it, and its free-text `shift` column
-- means something different -- which rota a student is on, not when they
-- may chart. "Nurse" is the existing 'student' role; no user_role change.
--
-- DEADLINES. assessment_assignments.deadline (009) has been advisory
-- since it was added: nothing rejected a request because it passed, and
-- the 'overdue' status was rendered by four UI components but written by
-- zero code paths. This migration adds the assessment-level default that
-- assignments inherit, and the sweep that finally writes 'overdue'.
-- =================================================================

do $$ begin
  create type shift_type as enum ('am', 'pm', 'night', 'custom');
exception when duplicate_object then null; end $$;

-- Only two states. "Currently active" is derived from starts_at/ends_at
-- vs now(), so nothing has to flip a row for a shift to begin or end --
-- which is exactly the trap the unwritten 'overdue' status fell into.
do $$ begin
  create type shift_status as enum ('scheduled', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type shift_attendance_status as enum
    ('scheduled', 'present', 'late', 'absent', 'excused');
exception when duplicate_object then null; end $$;

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  campus_id  uuid references public.campuses(id) on delete set null,
  -- Nullable: some shifts are ward-wide rather than tied to one room.
  -- set null (not cascade) so deleting a room can't erase a schedule.
  room_id    uuid references public.rooms(id)    on delete set null,
  -- Denormalized from the assigned nurses so faculty scoping is a plain
  -- `in (my sections)` instead of "shifts having at least one of my students".
  section_id uuid references public.sections(id) on delete set null,
  created_by uuid references public.users(id)    on delete set null,
  label text,
  shift_type shift_type not null default 'custom',
  starts_at timestamptz not null,
  ends_at   timestamptz not null,
  -- null = inherit rooms.capacity; 0 = unlimited (same convention as 008).
  capacity int check (capacity is null or capacity >= 0),
  notes text,
  status shift_status not null default 'scheduled',
  -- Shared by every occurrence a single "repeat" created. No FK and no
  -- template table: this is enough to edit or cancel "the rest of this
  -- series" without a second background job to materialize occurrences.
  series_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint shifts_window_ordered check (ends_at > starts_at)
);

-- The shift gate's hot path: scheduled shifts whose window contains now().
create index if not exists idx_shifts_window
  on public.shifts(starts_at, ends_at) where status = 'scheduled';
create index if not exists idx_shifts_room       on public.shifts(room_id);
create index if not exists idx_shifts_section    on public.shifts(section_id);
create index if not exists idx_shifts_campus     on public.shifts(campus_id);
create index if not exists idx_shifts_created_by on public.shifts(created_by);
create index if not exists idx_shifts_series
  on public.shifts(series_id) where series_id is not null;

alter table public.shifts enable row level security;

drop policy if exists "authenticated users can read shifts" on public.shifts;

create policy "authenticated users can read shifts" on public.shifts
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('student', 'faculty', 'admin')
    )
  );

drop policy if exists "faculty and admin manage shifts" on public.shifts;

create policy "faculty and admin manage shifts" on public.shifts
  for all using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop trigger if exists trg_shifts_updated_at on public.shifts;
create trigger trg_shifts_updated_at
  before update on public.shifts
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------
-- Nurses assigned to a shift.
--
-- checked_in_at is stamped by the first gated clinical write of the
-- shift (or a manual check-in) and is never a precondition for that
-- write: requiring a check-in tap would break the mobile offline path
-- and make the gate two failure modes deep.
-- -----------------------------------------------------------------

create table if not exists public.shift_assignments (
  id uuid primary key default gen_random_uuid(),
  shift_id   uuid not null references public.shifts(id) on delete cascade,
  student_id uuid not null references public.users(id)  on delete cascade,
  assigned_by uuid references public.users(id) on delete set null,
  attendance_status shift_attendance_status not null default 'scheduled',
  checked_in_at  timestamptz,
  checked_out_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shift_id, student_id)
);

create index if not exists idx_shift_assignments_student
  on public.shift_assignments(student_id);
create index if not exists idx_shift_assignments_shift
  on public.shift_assignments(shift_id);

alter table public.shift_assignments enable row level security;

drop policy if exists "students read own shift assignments" on public.shift_assignments;

create policy "students read own shift assignments" on public.shift_assignments
  for select using (auth.uid() = student_id);

drop policy if exists "faculty and admin manage shift assignments" on public.shift_assignments;

create policy "faculty and admin manage shift assignments" on public.shift_assignments
  for all using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop trigger if exists trg_shift_assignments_updated_at on public.shift_assignments;
create trigger trg_shift_assignments_updated_at
  before update on public.shift_assignments
  for each row execute function public.set_updated_at();

-- =================================================================
-- Assessment-level default deadline
--
-- Effective deadline for a student =
--   coalesce(assessment_assignments.deadline, assessments.deadline)
--
-- Past it, starting a NEW attempt is refused. An attempt already
-- in_progress may still be resumed and submitted -- the mobile quiz
-- screen starts its attempt from a mount effect, so refusing the resume
-- would strand a student mid-quiz with no way to reach submit.
-- =================================================================

alter table public.assessments
  add column if not exists deadline timestamptz;

-- Support the overdue sweep and the reminder job's candidate scan.
create index if not exists idx_assessment_assignments_deadline
  on public.assessment_assignments(status, deadline) where deadline is not null;
create index if not exists idx_assessments_deadline
  on public.assessments(deadline) where deadline is not null;

-- JUDGEMENT CALL -- delete this statement if you disagree.
-- Deadlines set while the column was advisory would retroactively lock
-- students out of quizzes nobody told them were closing. Nothing read
-- the column before now, so clearing the already-past ones loses no
-- behaviour; future deadlines are untouched.
update public.assessment_assignments
   set deadline = null
 where deadline < now()
   and status in ('pending', 'in_progress');

-- -----------------------------------------------------------------
-- Reminder ledger.
--
-- Makes the deadline job idempotent under repeated hourly firing and
-- concurrent runs: `insert ... on conflict do nothing ... returning`
-- means only the run that actually claimed a (assignment, window) pair
-- sends its notification. A read-then-write against `notifications`
-- would race.
--
-- `reminder_window`, not `window`: WINDOW is a reserved word in Postgres.
-- -----------------------------------------------------------------

create table if not exists public.assessment_deadline_reminders (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null
    references public.assessment_assignments(id) on delete cascade,
  reminder_window text not null,        -- '24h' | '1h'
  deadline timestamptz not null,        -- the deadline reminded about
  sent_at timestamptz not null default now(),
  unique (assignment_id, reminder_window)
);

create index if not exists idx_deadline_reminders_assignment
  on public.assessment_deadline_reminders(assignment_id);

alter table public.assessment_deadline_reminders enable row level security;

drop policy if exists "faculty and admin read deadline reminders"
  on public.assessment_deadline_reminders;

create policy "faculty and admin read deadline reminders"
  on public.assessment_deadline_reminders
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

-- -----------------------------------------------------------------
-- Overdue sweep.
--
-- Pure SQL so pg_cron can own it, matching 014's best-effort block.
-- POST /api/jobs/deadline-reminders calls the same function over RPC so
-- it still runs where the extension is absent, and the student list
-- route derives is_overdue on read -- three layers, because the
-- 'overdue' column is denormalization for faculty reporting, not the
-- source of truth.
-- -----------------------------------------------------------------

create or replace function public.sweep_overdue_assignments()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  swept int;
begin
  with effective as (
    select aa.id
      from public.assessment_assignments aa
      join public.assessments a on a.id = aa.assessment_id
     where aa.status in ('pending', 'in_progress')
       and coalesce(aa.deadline, a.deadline) is not null
       and coalesce(aa.deadline, a.deadline) < now()
       -- An attempt still open is allowed to finish; don't mark it
       -- overdue out from under a student who is mid-quiz.
       and not exists (
         select 1 from public.assessment_attempts att
          where att.assignment_id = aa.id
            and att.status = 'in_progress'
       )
  )
  update public.assessment_assignments aa
     set status = 'overdue'
    from effective e
   where aa.id = e.id;
  get diagnostics swept = row_count;
  return swept;
end;
$$;

revoke execute on function public.sweep_overdue_assignments() from public, anon, authenticated;
grant  execute on function public.sweep_overdue_assignments() to service_role;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sweep-overdue-assignments', '5 * * * *',
                          'select public.sweep_overdue_assignments()');
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;
