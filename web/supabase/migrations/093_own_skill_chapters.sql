-- =================================================================
-- 093: A chapter for an instructor's own skill.
--
-- An instructor can now write their own skill on a Patient Case or Return
-- Demonstration, beside the Taylor's ones, and file it under one of the book's
-- 18 chapters. A Taylor's skill's chapter comes from its number ("1-7" is
-- Chapter 1), so only an own skill (skill_id null) uses this column.
--
-- scenario_tasks.chapter: 1-18, or null for a skill outside the book.
--
-- Until this runs, own skills save without a chapter and the form says so.
-- Nothing existing changes. Re-running is safe.
-- =================================================================

alter table public.scenario_tasks
  add column if not exists chapter smallint;

alter table public.scenario_tasks
  drop constraint if exists scenario_tasks_chapter_ck;
alter table public.scenario_tasks
  add constraint scenario_tasks_chapter_ck check (chapter is null or chapter between 1 and 18);

comment on column public.scenario_tasks.chapter is
  'The Taylor''s chapter (1-18) an instructor''s own skill is filed under; null for Taylor''s skills (their number says) and for own skills outside the book.';
