-- =================================================================
-- 088: Longer course fields.
--
-- 065 capped a course title at 120 characters, but the full titles in the
-- BSN curriculum run longer (NCM 112L is 181), so a Dean could not assign
-- NCM 112L, 116L or 118L. These limits match COURSE_LIMITS in
-- app/lib/course-progress.ts; change the two together.
--
-- It only widens the checks, so every existing row still passes. Until it
-- is applied, a value past the old limit gets a 503 naming this migration.
-- =================================================================

-- 065 left these checks unnamed, so find them by what they check. A name
-- that differs live would otherwise leave the old limit standing, silently.
do $$
declare
  c record;
begin
  for c in
    select conrelid::regclass as table_name, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.academic_terms'::regclass, 'public.courses'::regclass)
      and pg_get_constraintdef(oid) like '%char_length%'
  loop
    execute format('alter table %s drop constraint %I', c.table_name, c.conname);
  end loop;
end
$$;

alter table public.academic_terms
  add constraint academic_terms_name_check check (char_length(btrim(name)) between 1 and 150);

alter table public.courses
  add constraint courses_code_check check (char_length(btrim(code)) between 1 and 50),
  add constraint courses_title_check check (char_length(btrim(title)) between 1 and 1000),
  add constraint courses_description_check check (char_length(description) <= 5000);
