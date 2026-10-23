-- =================================================================
-- 080: Program Chairs.
--
-- A Program Chair has exactly a Dean's access: the same portal, the same
-- features, and their own instructors, students, wards and records, kept
-- apart from every other Dean's (077). So a Program Chair is stored as a
-- Dean (role 'admin') with a title, and only the name on screen differs.
-- Every check that lets a Dean in lets a Program Chair in too, including
-- the triggers in 053 and 077 that look for role = 'admin'.
--
-- users.admin_title: null is a Dean, 'program_chair' a Program Chair.
-- Widen the check to add another Dean-level title.
--
-- The app reads the column only once it exists. Before this migration,
-- signing in works as it did and the Program Chair choice stays hidden.
-- =================================================================

alter table public.users
  add column if not exists admin_title text;

alter table public.users drop constraint if exists users_admin_title_check;
alter table public.users
  add constraint users_admin_title_check check (admin_title in ('program_chair'));

-- Only a Dean-level account carries a title. A role change away from admin
-- clears it rather than failing.
create or replace function public.clear_user_admin_title()
returns trigger
language plpgsql
as $fn$
begin
  if new.role <> 'admin' then
    new.admin_title := null;
  end if;
  return new;
end;
$fn$;

drop trigger if exists trg_users_admin_title on public.users;
create trigger trg_users_admin_title
  before insert or update of admin_title, role on public.users
  for each row execute function public.clear_user_admin_title();
