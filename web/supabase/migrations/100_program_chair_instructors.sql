-- =================================================================
-- 100: The Dean assigns instructors to each Program Chair.
--
-- A Program Chair works in their Dean's space (099), but sees only the
-- instructors the Dean has assigned to them, and those instructors' groups,
-- sections and students. An instructor can be assigned to several Program
-- Chairs. A Program Chair with nobody assigned sees no instructors yet.
-- The app reads and writes this through the service role (RLS on, no policies).
-- Safe to re-run.
-- =================================================================

create table if not exists public.program_chair_instructors (
  chair_id uuid not null references public.users(id) on delete cascade,
  faculty_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (chair_id, faculty_id)
);

create index if not exists program_chair_instructors_faculty_idx
  on public.program_chair_instructors(faculty_id);

alter table public.program_chair_instructors enable row level security;
