-- =================================================================
-- 075: Library materials belong to a course; case presentations go to groups.
--
-- 1. Library materials
-- Like Patient Cases, Quizzes and Case Presentations (070), a material an
-- instructor publishes is for one of their courses (a course offering).
-- The course's students see it: those in its sections (narrowed by
-- target_sections when the instructor picks some), and students the
-- instructor added to the course by hand (073).
--
-- offering_id is null for a material made for no course (a Dean's, or one
-- from before 075); it keeps the old rule: target_sections, or every
-- section when that is null.
--
-- Existing materials are linked once, from their maker: an instructor who
-- teaches exactly one course in the term the material was made in has it in
-- that course. Re-running is safe: only materials with no course are touched.
-- =================================================================

alter table public.library_materials add column if not exists offering_id uuid
  references public.course_offerings(id) on delete set null;

create index if not exists idx_library_materials_offering on public.library_materials (offering_id);

with sole as (
  select o.faculty_id, t.starts_on, t.ends_on, min(o.id::text)::uuid as offering_id
  from public.course_offerings o
  join public.academic_terms t on t.id = o.term_id
  where o.faculty_id is not null
  group by o.faculty_id, t.id, t.starts_on, t.ends_on
  having count(*) = 1
)
update public.library_materials m
set offering_id = sole.offering_id
from sole
where m.offering_id is null
  and m.created_by = sole.faculty_id
  and m.created_at::date between sole.starts_on and sole.ends_on;

-- -----------------------------------------------------------------
-- 2. Case presentations are handed out by group.
--
-- An instructor gives a presentation to groups of a course (and to whole
-- sections where they supervise no group). team_ids records the groups it
-- went to; section_ids keeps every section it reached. Older presentations,
-- given to whole sections, have no team_ids.
-- -----------------------------------------------------------------

alter table public.case_presentations add column if not exists team_ids uuid[] not null default '{}';
