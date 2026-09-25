-- =================================================================
-- 053: Each admin has their own faculty.
--
-- users.admin_id names the admin a faculty member belongs to. An admin sees
-- and manages only their own faculty, those faculty's sections (plus any
-- section no faculty is attached to yet), and the students in them. Rooms
-- and patients stay shared. Removing an admin leaves their faculty without
-- one; the dev team reassigns them.
--
-- The dev team sets admin_id when it creates a faculty account (developer
-- console row editor). The two existing faculty are assigned below.
-- =================================================================

alter table public.users
  add column if not exists admin_id uuid references public.users(id) on delete set null;

create index if not exists idx_users_admin on public.users(admin_id);

-- Only a faculty account belongs to an admin, and only an admin can own one.
-- A role change away from faculty clears the owner rather than failing.
create or replace function public.check_user_admin_owner()
returns trigger
language plpgsql
as $fn$
begin
  -- Someone who stops being faculty stops belonging to an admin.
  if new.role <> 'faculty' then
    new.admin_id := null;
    return new;
  end if;
  if new.admin_id is null then
    return new;
  end if;
  if not exists (select 1 from public.users a where a.id = new.admin_id and a.role = 'admin') then
    raise exception 'admin_id must name an admin account';
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_users_admin_owner on public.users;
create trigger trg_users_admin_owner
  before insert or update of admin_id, role on public.users
  for each row execute function public.check_user_admin_owner();

-- Existing faculty (decided 2026-09-25): Michael Smith -> John Doe,
-- Drei Cachola -> Solemn. No-ops where these accounts don't exist.
update public.users set admin_id = '97572316-3f6e-433c-9950-8be5b618c3ae'
  where id = '43609d8e-d845-48c3-8b33-1444e1fd3e59' and role = 'faculty'
    and exists (select 1 from public.users where id = '97572316-3f6e-433c-9950-8be5b618c3ae' and role = 'admin');
update public.users set admin_id = '4c9845da-8e47-400b-90ec-8b4cd1e100b4'
  where id = '1a304628-ccee-4eac-a73b-42e8da65ce16' and role = 'faculty'
    and exists (select 1 from public.users where id = '4c9845da-8e47-400b-90ec-8b4cd1e100b4' and role = 'admin');
