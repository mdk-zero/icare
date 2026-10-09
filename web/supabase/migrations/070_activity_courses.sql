-- =================================================================
-- 070: Activities belong to the course they were made for.
--
-- A course's grading no longer comes from a checklist the instructor
-- fills in by hand. Every Patient Case, Quiz and Case Presentation an
-- instructor makes is made for one of their courses (a course offering:
-- the course, in a term, taught by them), and that is what files it as an
-- item under the course's Patient Cases, Quizzes or Case Presentations
-- part. A part's grade is the average of its items and the final grade
-- the average of every item, so nothing is weighted by hand.
--
-- offering_id is null for an activity made for no course (a Dean's, or one
-- from before 070); it then counts toward no course.
--
-- Existing activities are linked once, in order:
--   1. from the checklist: an item that linked an activity puts it in that
--      item's course (the first such course, if several);
--   2. otherwise from its maker: an instructor who teaches exactly one
--      course in the term the activity was made in has it in that course.
-- Re-running is safe: only activities with no course yet are touched.
--
-- The old checklist tables stay as they are; the app stops reading them.
-- =================================================================

alter table public.scenarios add column if not exists offering_id uuid
  references public.course_offerings(id) on delete set null;
alter table public.assessments add column if not exists offering_id uuid
  references public.course_offerings(id) on delete set null;
alter table public.case_presentations add column if not exists offering_id uuid
  references public.course_offerings(id) on delete set null;

create index if not exists idx_scenarios_offering on public.scenarios (offering_id);
create index if not exists idx_assessments_offering on public.assessments (offering_id);
create index if not exists idx_case_presentations_offering on public.case_presentations (offering_id);

-- 1. From the checklist.
update public.scenarios s
set offering_id = r.offering_id
from (
  select distinct on (scenario_id) scenario_id, offering_id
  from public.course_requirements
  where scenario_id is not null
  order by scenario_id, created_at
) r
where s.id = r.scenario_id and s.offering_id is null;

update public.assessments a
set offering_id = r.offering_id
from (
  select distinct on (assessment_id) assessment_id, offering_id
  from public.course_requirements
  where assessment_id is not null
  order by assessment_id, created_at
) r
where a.id = r.assessment_id and a.offering_id is null;

update public.case_presentations c
set offering_id = r.offering_id
from (
  select distinct on (presentation_id) presentation_id, offering_id
  from public.course_requirements
  where presentation_id is not null
  order by presentation_id, created_at
) r
where c.id = r.presentation_id and c.offering_id is null;

-- 2. From the maker, when they teach exactly one course in that term.
with sole as (
  select o.faculty_id, t.starts_on, t.ends_on, min(o.id::text)::uuid as offering_id
  from public.course_offerings o
  join public.academic_terms t on t.id = o.term_id
  where o.faculty_id is not null
  group by o.faculty_id, t.id, t.starts_on, t.ends_on
  having count(*) = 1
)
update public.scenarios s
set offering_id = sole.offering_id
from sole
where s.offering_id is null
  and s.created_by = sole.faculty_id
  and s.created_at::date between sole.starts_on and sole.ends_on;

with sole as (
  select o.faculty_id, t.starts_on, t.ends_on, min(o.id::text)::uuid as offering_id
  from public.course_offerings o
  join public.academic_terms t on t.id = o.term_id
  where o.faculty_id is not null
  group by o.faculty_id, t.id, t.starts_on, t.ends_on
  having count(*) = 1
)
update public.assessments a
set offering_id = sole.offering_id
from sole
where a.offering_id is null
  and a.created_by = sole.faculty_id
  and a.created_at::date between sole.starts_on and sole.ends_on;

with sole as (
  select o.faculty_id, t.starts_on, t.ends_on, min(o.id::text)::uuid as offering_id
  from public.course_offerings o
  join public.academic_terms t on t.id = o.term_id
  where o.faculty_id is not null
  group by o.faculty_id, t.id, t.starts_on, t.ends_on
  having count(*) = 1
)
update public.case_presentations c
set offering_id = sole.offering_id
from sole
where c.offering_id is null
  and c.created_by = sole.faculty_id
  and c.created_at::date between sole.starts_on and sole.ends_on;
