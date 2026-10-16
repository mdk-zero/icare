-- =================================================================
-- 073: Students an instructor adds to their course by hand.
--
-- A course offering's roster is still worked out from sections and
-- clinical groups when it is read:
--   * in a section where the instructor supervises a group, the students
--     of their groups;
--   * in a section where they supervise no group, every student of that
--     section, so an assigned instructor always has their students.
-- This table adds the students the instructor puts on the roster
-- personally, such as an irregular student from another section.
--
-- (Numbered 073: 071 and 072 are the skill lists and push tokens.)
-- Re-running is safe.
-- =================================================================

create table if not exists public.course_offering_students (
  offering_id uuid not null references public.course_offerings(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  added_by uuid references public.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (offering_id, student_id)
);

create index if not exists idx_course_offering_students_student
  on public.course_offering_students (student_id);

alter table public.course_offering_students enable row level security;
