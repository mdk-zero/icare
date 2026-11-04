-- =================================================================
-- 087: A Program Chair belongs to a Dean.
--
-- The Dean's Program Chairs page lists, adds and removes the Program Chairs
-- under that Dean, so a Program Chair now carries their Dean in
-- users.admin_id, the same column an instructor or student has. Nothing else
-- about a Program Chair changes: they keep their own instructors, students
-- and records (077), which the Dean does not see.
--
-- Needs 077 and 080. Run it in one go in the SQL editor. Every step is safe
-- to re-run.
--
-- Before this runs, the 077 trigger clears admin_id on every Dean-level row,
-- so the app refuses to add a Program Chair rather than leave one with no
-- Dean.
-- =================================================================

-- Replaces 077's check. Instructors and students work as they did, and may
-- belong to a Dean or a Program Chair. A Program Chair's own owner must be a
-- Dean proper, whose institution they take. A Dean has no owner.
create or replace function public.check_user_admin_owner()
returns trigger
language plpgsql
as $fn$
declare
  section_owner uuid;
  dean_campus uuid;
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

-- admin_title joins the list: a Program Chair retitled as a Dean loses their
-- owner in the same write.
drop trigger if exists trg_users_admin_owner on public.users;
create trigger trg_users_admin_owner
  before insert or update of admin_id, role, section_id, admin_title on public.users
  for each row execute function public.check_user_admin_owner();

create or replace function public.sync_program_chair_dean()
returns trigger
language plpgsql
as $fn$
begin
  -- Someone who stops being a Dean no longer manages Program Chairs.
  if new.role <> 'admin' or new.admin_title is not null then
    update public.users set admin_id = null where admin_id = new.id and role = 'admin';
  end if;
  -- A Program Chair handed to a Dean elsewhere takes their people along. The
  -- check above moves them, and a before trigger's change doesn't fire
  -- trg_users_dean_institution.
  if new.role = 'admin' and new.campus_id is distinct from old.campus_id then
    update public.users set campus_id = new.campus_id where admin_id = new.id;
  end if;
  return null;
end;
$fn$;

drop trigger if exists trg_users_program_chair_dean on public.users;
create trigger trg_users_program_chair_dean
  after update of admin_id, role, admin_title on public.users
  for each row execute function public.sync_program_chair_dean();

-- Existing Program Chairs go to the Dean of their institution when there is
-- exactly one. Any others wait for an Admin to choose, in Admin > Users.
update public.users chair
  set admin_id = dean.id
  from public.users dean
  where chair.role = 'admin'
    and chair.admin_title = 'program_chair'
    and chair.admin_id is null
    and dean.role = 'admin'
    and dean.admin_title is null
    and dean.campus_id = chair.campus_id
    and (
      select count(*) from public.users other
      where other.role = 'admin' and other.admin_title is null and other.campus_id = chair.campus_id
    ) = 1;
