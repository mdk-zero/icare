-- =================================================================
-- 069: Which courses a patient belongs to.
--
-- An instructor sees only the patients of the courses they are assigned
-- to teach (course_offerings.faculty_id), so a Health Assessment
-- instructor is not handed the Fundamentals ward. A patient can serve
-- more than one course, hence a link table rather than a column. The
-- Dean still sees every patient.
--
-- Existing patients are linked once, from who admitted them: a patient an
-- instructor added goes to the courses that instructor teaches, one a
-- Dean added to that Dean's courses, and one with no recorded creator to
-- every course, so nothing disappears from the ward today. Re-running is
-- safe: the backfill only touches patients with no link yet.
--
-- Like 065, everything goes through the service role in the API routes,
-- so RLS is on with no policies.
-- =================================================================

create table if not exists public.patient_courses (
  patient_id uuid not null references public.patients(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  added_by uuid references public.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (patient_id, course_id)
);

create index if not exists idx_patient_courses_course
  on public.patient_courses (course_id);

alter table public.patient_courses enable row level security;

with unlinked as (
  select p.id, p.created_by, u.role
  from public.patients p
  left join public.users u on u.id = p.created_by
  where not exists (select 1 from public.patient_courses pc where pc.patient_id = p.id)
)
insert into public.patient_courses (patient_id, course_id)
select distinct l.id, c.id
from unlinked l
join public.courses c on (
  (l.role = 'faculty' and exists (
    select 1 from public.course_offerings o
    where o.course_id = c.id and o.faculty_id = l.created_by
  ))
  or (l.role = 'admin' and c.admin_id = l.created_by)
  or (l.role is null or l.role not in ('faculty', 'admin'))
)
on conflict do nothing;

-- A patient whose creator teaches or owns no course yet would end up with
-- no link and vanish from every instructor; give those every course too.
insert into public.patient_courses (patient_id, course_id)
select p.id, c.id
from public.patients p
cross join public.courses c
where not exists (select 1 from public.patient_courses pc where pc.patient_id = p.id)
on conflict do nothing;
