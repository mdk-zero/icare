-- =================================================================
-- 099: A Program Chair works in their Dean's space.
--
-- Until now a Program Chair kept their own instructors, students and records
-- (077, 087), which their Dean did not see. Now a Program Chair sees and
-- manages exactly their Dean's: the app resolves a Program Chair to their Dean
-- (lib/dean-scope.ts deanFor), and what a Program Chair adds belongs to the
-- Dean. Only the Dean's Program Chairs page stays the Dean's alone.
--
-- 1. fill_owner_dean gives a row a Program Chair creates to their Dean (to the
--    Program Chair themselves while no Dean is linked, so it never turns into
--    a preset everyone sees).
-- 2. check_user_admin_owner gives an instructor or student assigned to a
--    linked Program Chair to that Program Chair's Dean.
-- 3. Everything a linked Program Chair owns moves to their Dean. A term with
--    the same name as one of the Dean's is merged into it. A course code,
--    section name or room number both have stops the run, to be settled by
--    hand first.
--
-- Deploy the web code first, then run this soon after. Before the code, a
-- Program Chair whose records move here would see an empty portal. Between the
-- two, a record a Program Chair adds may stay theirs; this run moves it.
-- Run it in one go in the SQL editor. Every step is safe to re-run.
-- =================================================================

create or replace function public.fill_owner_dean()
returns trigger
language plpgsql
as $fn$
begin
  if new.admin_id is null and new.created_by is not null then
    select case
             when u.role = 'admin' and u.admin_title = 'program_chair' then coalesce(u.admin_id, u.id)
             when u.role = 'admin' then u.id
             when u.role = 'faculty' then u.admin_id
           end
      into new.admin_id
      from public.users u
      where u.id = new.created_by;
  end if;
  return new;
end;
$fn$;

-- 087's check, plus: an instructor or student given to a linked Program
-- Chair belongs to that Program Chair's Dean, whoever sets it (the Admin's
-- Users page, the developer console, a script).
create or replace function public.check_user_admin_owner()
returns trigger
language plpgsql
as $fn$
declare
  section_owner uuid;
  dean_campus uuid;
  chair_dean uuid;
begin
  if new.role = 'admin' and new.admin_title = 'program_chair' then
    if new.admin_id is null then
      return new;
    end if;
    select a.campus_id into dean_campus
      from public.users a
      where a.id = new.admin_id and a.id <> new.id and a.role = 'admin' and a.admin_title is null;
    if not found then
      -- Their Dean has since stopped being one: they belong to nobody now,
      -- rather than every later edit of the account failing.
      if tg_op = 'UPDATE' and new.admin_id is not distinct from old.admin_id then
        new.admin_id := null;
        return new;
      end if;
      raise exception 'admin_id must name a Dean';
    end if;
    if dean_campus is not null then
      new.campus_id := dean_campus;
    end if;
    return new;
  end if;
  if new.role not in ('faculty', 'student') then
    new.admin_id := null;
    return new;
  end if;
  if new.admin_id is not null then
    select a.admin_id into chair_dean
      from public.users a
      where a.id = new.admin_id and a.role = 'admin' and a.admin_title = 'program_chair' and a.admin_id is not null;
    if found then
      new.admin_id := chair_dean;
    end if;
  end if;
  if new.role = 'student' and new.section_id is not null then
    select s.admin_id into section_owner from public.sections s where s.id = new.section_id;
    if section_owner is not null then
      new.admin_id := section_owner;
    end if;
  end if;
  if new.admin_id is null then
    return new;
  end if;
  select a.campus_id into dean_campus from public.users a where a.id = new.admin_id and a.role = 'admin';
  if not found then
    if tg_op = 'UPDATE' and new.admin_id is not distinct from old.admin_id then
      new.admin_id := null;
      return new;
    end if;
    raise exception 'admin_id must name an admin account';
  end if;
  if dean_campus is not null then
    new.campus_id := dean_campus;
  end if;
  return new;
end;
$fn$;

do $$
declare
  pc record;
  clash text;
begin
  for pc in
    select u.id, u.admin_id as dean_id
      from public.users u
      where u.role = 'admin' and u.admin_title = 'program_chair' and u.admin_id is not null
  loop
    -- What the merge can't settle by itself: the same course, section or room on both sides.
    select string_agg(x, ', ') into clash from (
      select 'course ' || c.code as x from public.courses c
        where c.admin_id = pc.id
          and exists (select 1 from public.courses d where d.admin_id = pc.dean_id and lower(btrim(d.code)) = lower(btrim(c.code)))
      union all
      select 'section ' || s.name from public.sections s
        where s.admin_id = pc.id
          and exists (select 1 from public.sections d where d.admin_id = pc.dean_id and lower(btrim(d.name)) = lower(btrim(s.name)))
      union all
      select 'room ' || r.room_number from public.rooms r
        where r.admin_id = pc.id
          and exists (select 1 from public.rooms d where d.admin_id = pc.dean_id and d.room_number = r.room_number)
    ) clashes;
    if clash is not null then
      raise exception 'Program Chair % and their Dean % both have %. Rename or merge these first.', pc.id, pc.dean_id, clash;
    end if;

    -- A term the Dean has too (same name): its course assignments move into the Dean's term.
    update public.course_offerings o
       set term_id = d.id
      from public.academic_terms t
      join public.academic_terms d on d.admin_id = pc.dean_id and lower(btrim(d.name)) = lower(btrim(t.name))
     where o.term_id = t.id and t.admin_id = pc.id;
    delete from public.academic_terms t
     where t.admin_id = pc.id
       and exists (select 1 from public.academic_terms d where d.admin_id = pc.dean_id and lower(btrim(d.name)) = lower(btrim(t.name)));

    update public.academic_terms     set admin_id = pc.dean_id where admin_id = pc.id;
    update public.courses            set admin_id = pc.dean_id where admin_id = pc.id;
    -- Sections first: their students follow (077's sync_section_students).
    update public.sections           set admin_id = pc.dean_id where admin_id = pc.id;
    update public.rooms              set admin_id = pc.dean_id where admin_id = pc.id;
    update public.ward_fixtures      set admin_id = pc.dean_id where admin_id = pc.id;
    update public.patients           set admin_id = pc.dean_id where admin_id = pc.id;
    update public.scenarios          set admin_id = pc.dean_id where admin_id = pc.id;
    update public.assessments        set admin_id = pc.dean_id where admin_id = pc.id;
    update public.case_presentations set admin_id = pc.dean_id where admin_id = pc.id;
    update public.library_materials  set admin_id = pc.dean_id where admin_id = pc.id;
    update public.scenario_categories set admin_id = pc.dean_id where admin_id = pc.id;
    -- A curriculum keeps being in use only if the Dean has none in use.
    update public.curricula c
       set admin_id = pc.dean_id,
           is_active = c.is_active and not exists (select 1 from public.curricula d where d.admin_id = pc.dean_id and d.is_active)
     where c.admin_id = pc.id;
    update public.users set admin_id = pc.dean_id where admin_id = pc.id and role in ('faculty', 'student');
  end loop;
end $$;
