-- =================================================================
-- 067: The grading split, and Written Exams.
--
-- An instructor divides their course's grade into weighted parts
-- ("Written Exams 30%", "Laboratory & Skills 70%") and, inside a part,
-- components ("Midterm 15%", "Final 15%"), and files checklist items
-- under them. The whole split is one JSON document on the offering:
--   { "parts": [ { "id", "name", "weight", "items": [requirement ids],
--                  "components": [ { "id", "name", "weight", "items" } ] } ] }
-- Weights are percents of the final grade at both levels. The rules
-- (parts add up to 100, a part's components to its weight, items only
-- on leaves, never a shift count) live in web/app/lib/course-grading.ts,
-- which the API checks on every save; saving the split in one update
-- keeps it from ever being half-written. Null means no split yet.
--
-- Grades are not stored: they are worked out from graded work and
-- entered scores whenever the course's progress is read.
--
-- A manual checklist item is now either a Lab Activity or a Written
-- Exam (a paper exam whose score the instructor enters), shown in its
-- own section. The other kinds are always 'lab'.
--
-- 067 does not depend on 066, so either can be applied first. RLS is
-- unchanged: everything goes through the service role in the API routes.
-- =================================================================

alter table public.course_offerings add column if not exists grading jsonb;

alter table public.course_offerings drop constraint if exists course_offerings_grading_ck;
alter table public.course_offerings add constraint course_offerings_grading_ck
  check (grading is null or jsonb_typeof(grading) = 'object');

alter table public.course_requirements add column if not exists manual_type text not null default 'lab';

alter table public.course_requirements drop constraint if exists course_requirements_manual_type_ck;
alter table public.course_requirements add constraint course_requirements_manual_type_ck
  check (manual_type in ('lab', 'exam') and (kind = 'manual' or manual_type = 'lab'));
