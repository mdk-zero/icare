-- =================================================================
-- 077: Institutions, and each Dean's data kept apart.
--
-- A Dean (role admin) belongs to an institution: the `campuses` table from
-- 007, which the screens call "Institution". Two Deans may share one
-- institution, but each still sees only their own data: their instructors
-- (users.admin_id, 053), their sections and students, their wards, and
-- everything they and their instructors make. Nothing is shared between
-- Deans, in the same institution or not.
--
-- Ownership is the Dean's id in an admin_id column:
--   sections, rooms, ward_fixtures   set by the Dean who creates them
--   patients, scenarios,             filled in from created_by on insert:
--   assessments, case_presentations, the Dean who made it, or the Dean of
--   library_materials,               the instructor who did
--   scenario_categories              (null: a preset everyone shares)
--   users, for students              the Dean who owns their section; kept
--                                    if the section is deleted, so a Dean
--                                    never loses an unsectioned student
-- Instructors and students also take their Dean's institution (campus_id).
--
-- Section names and room numbers are unique per Dean now instead of
-- system-wide, so two Deans can each have a "BSN 1101". Category names stay
-- unique system-wide: scenarios.category references them by name (042).
--
-- The split of the existing data (decided 2026-10-17): Ronarica B. Diones
-- gets "Batangas State University - The NEU ARASOF Nasugbu" (the existing
-- campus, renamed) with her instructors, sections, terms and courses. John
-- Doe, the Dean used for testing, gets a separate "iCARE++ Test
-- Institution" with his instructor and students, the wards, the patients
-- and all the existing cases, quizzes and materials.
--
-- Run it in one go in the SQL editor. Every step is safe to re-run.
-- =================================================================

-- Institutions ------------------------------------------------------------

update public.campuses
  set name = 'Batangas State University - The NEU ARASOF Nasugbu'
  where code = 'ARASOF-NASUGBU';

insert into public.campuses (name, code, address)
values ('iCARE++ Test Institution', 'ICARE-TEST', null)
on conflict (code) do nothing;

-- Owner columns -------------------------------------------------------------

alter table public.sections
  add column if not exists admin_id uuid references public.users(id) on delete set null;
create index if not exists idx_sections_admin on public.sections(admin_id);

alter table public.rooms
  add column if not exists admin_id uuid references public.users(id) on delete set null;
create index if not exists idx_rooms_admin on public.rooms(admin_id);

-- The Dean a row made by `created_by` belongs to: the creator when they are
-- a Dean, their Dean when they are an instructor, nobody otherwise.
create or replace function public.fill_owner_dean()
returns trigger
language plpgsql
as $fn$
begin
  if new.admin_id is null and new.created_by is not null then
    select case u.role when 'admin' then u.id when 'faculty' then u.admin_id end
      into new.admin_id
      from public.users u
      where u.id = new.created_by;
  end if;
  return new;
end;
$fn$;

-- Tables a later migration may not have created yet (061, 062) are skipped.
do $$
declare
  t text;
begin
  foreach t in array array[
    'patients', 'scenarios', 'assessments', 'case_presentations',
    'library_materials', 'scenario_categories', 'ward_fixtures'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format(
      'alter table public.%I add column if not exists admin_id uuid references public.users(id) on delete set null', t);
    execute format('create index if not exists %I on public.%I (admin_id)', 'idx_' || t || '_admin', t);
    execute format('drop trigger if exists %I on public.%I', 'trg_' || t || '_owner', t);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.fill_owner_dean()',
      'trg_' || t || '_owner', t);
    -- What already exists belongs to its creator's Dean.
    execute format(
      $q$update public.%I t
           set admin_id = case u.role when 'admin' then u.id when 'faculty' then u.admin_id end
           from public.users u
           where u.id = t.created_by and t.admin_id is null$q$, t);
  end loop;
end $$;

-- Per-Dean names ------------------------------------------------------------

-- Drops a table's unique constraint over exactly these columns, whatever it
-- was named when it was created.
do $$
declare
  c record;
begin
  for c in
    select con.conrelid::regclass as tbl, con.conname
    from pg_constraint con
    where con.contype = 'u'
      and con.conrelid in ('public.sections'::regclass, 'public.rooms'::regclass)
      and (
        select array_agg(a.attname::text order by a.attname)
        from pg_attribute a
        where a.attrelid = con.conrelid and a.attnum = any (con.conkey)
      ) in (array['name'], array['campus_id', 'room_number'])
  loop
    execute format('alter table %s drop constraint %I', c.tbl, c.conname);
  end loop;
end $$;

create unique index if not exists sections_admin_name_uq
  on public.sections (admin_id, lower(btrim(name)));
create unique index if not exists rooms_admin_number_uq
  on public.rooms (admin_id, room_number);

-- Students belong to a Dean ------------------------------------------------

-- Replaces 053's check. Instructors and students belong to a Dean; a
-- student's Dean is whoever owns their section, and stays put when they have
-- none. Both take the Dean's institution.
create or replace function public.check_user_admin_owner()
returns trigger
language plpgsql
as $fn$
declare
  section_owner uuid;
  dean_campus uuid;
begin
  if new.role not in ('faculty', 'student') then
    new.admin_id := null;
    return new;
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
    -- Their Dean has since stopped being one: they belong to nobody now,
    -- rather than every later edit of the account failing.
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

drop trigger if exists trg_users_admin_owner on public.users;
create trigger trg_users_admin_owner
  before insert or update of admin_id, role, section_id on public.users
  for each row execute function public.check_user_admin_owner();

-- A Dean who moves institution takes their people along.
create or replace function public.sync_dean_institution()
returns trigger
language plpgsql
as $fn$
begin
  if new.role = 'admin' and new.campus_id is distinct from old.campus_id then
    update public.users set campus_id = new.campus_id where admin_id = new.id;
  end if;
  return null;
end;
$fn$;

drop trigger if exists trg_users_dean_institution on public.users;
create trigger trg_users_dean_institution
  after update of campus_id on public.users
  for each row execute function public.sync_dean_institution();

-- A section handed to another Dean takes its students along.
create or replace function public.sync_section_students()
returns trigger
language plpgsql
as $fn$
begin
  if new.admin_id is not null and new.admin_id is distinct from old.admin_id then
    update public.users set admin_id = new.admin_id where section_id = new.id and role = 'student';
  end if;
  return null;
end;
$fn$;

drop trigger if exists trg_sections_owner on public.sections;
create trigger trg_sections_owner
  after update of admin_id on public.sections
  for each row execute function public.sync_section_students();

-- Existing sections and students ---------------------------------------------

-- A section belongs to the Dean whose course runs in it, else to the Dean of
-- an instructor attached to it or supervising a group in it.
update public.sections s
  set admin_id = c.admin_id
  from public.course_offering_sections cos
  join public.course_offerings o on o.id = cos.offering_id
  join public.courses c on c.id = o.course_id
  where cos.section_id = s.id and s.admin_id is null and c.admin_id is not null;

update public.sections s
  set admin_id = f.admin_id
  from public.faculty_sections fs
  join public.users f on f.id = fs.faculty_id
  where fs.section_id = s.id and s.admin_id is null and f.role = 'faculty' and f.admin_id is not null;

update public.sections s
  set admin_id = f.admin_id
  from public.teams t
  join public.users f on f.id = t.faculty_id
  where t.section_id = s.id and s.admin_id is null and f.role = 'faculty' and f.admin_id is not null;

update public.users u
  set admin_id = s.admin_id
  from public.sections s
  where u.section_id = s.id and u.role = 'student' and s.admin_id is not null
    and u.admin_id is distinct from s.admin_id;

-- The split (2026-10-17) ------------------------------------------------------

do $$
declare
  john constant uuid := '97572316-3f6e-433c-9950-8be5b618c3ae';
  ronarica constant uuid := '9961f2b4-d4c1-4458-99b6-b6d8b777db5e';
  t text;
begin
  update public.users
    set campus_id = (select id from public.campuses where code = 'ARASOF-NASUGBU')
    where id = ronarica and role = 'admin';

  if not exists (select 1 from public.users where id = john and role = 'admin') then
    return;
  end if;

  update public.users
    set campus_id = (select id from public.campuses where code = 'ICARE-TEST')
    where id = john;

  -- Everything nobody owns yet is John Doe's test data: the wards, the
  -- patients, and what former instructors (now Admins) made.
  foreach t in array array[
    'sections', 'rooms', 'patients', 'scenarios', 'assessments',
    'case_presentations', 'library_materials', 'ward_fixtures'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('update public.%I set admin_id = $1 where admin_id is null', t) using john;
    end if;
  end loop;

  update public.users set admin_id = john where role = 'student' and admin_id is null;
end $$;

-- Everyone at their Dean's institution, and rooms with them.
update public.users p
  set campus_id = d.campus_id
  from public.users d
  where p.admin_id = d.id and d.role = 'admin' and d.campus_id is not null
    and p.campus_id is distinct from d.campus_id;

update public.rooms r
  set campus_id = d.campus_id
  from public.users d
  where r.admin_id = d.id and d.campus_id is not null
    and r.campus_id is distinct from d.campus_id;

comment on column public.users.admin_id is
  'The Dean (role admin) an instructor or student belongs to. A student''s follows their section''s owner.';
comment on column public.sections.admin_id is 'The Dean who owns this section (077).';
comment on column public.rooms.admin_id is 'The Dean whose ward this room is in (077).';
