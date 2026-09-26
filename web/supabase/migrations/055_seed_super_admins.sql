-- =================================================================
-- 055: The super admins (decided 2026-09-26).
--
-- Kept apart from 054 on purpose: Postgres refuses to use an enum value in
-- the same transaction that added it, and the SQL editor runs a script as
-- one transaction. Apply 054 first, then this.
--
-- An existing account is promoted in place. A promoted admin stops owning
-- faculty (users.admin_id, migration 053): those faculty are left without
-- an admin for the super admin to reassign from /super-admin/users. An
-- email with no account yet gets one with no password; they sign in with
-- Google, or a super admin/dev issues a temporary password.
-- =================================================================

do $$
declare
  emails text[] := array['linuxadona17@gmail.com', 'dreicachola13@gmail.com', 'xreetempo@gmail.com'];
  has_owner boolean := exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'admin_id'
  );
begin
  if has_owner then
    execute $q$
      update public.users set admin_id = null
      where admin_id in (select id from public.users where lower(email) = any($1))
    $q$ using emails;
  end if;

  update public.users set role = 'super_admin'
  where lower(email) = any(emails) and role <> 'super_admin';

  insert into public.users (email, name, role)
  select e, split_part(e, '@', 1), 'super_admin'
  from unnest(emails) as e
  where not exists (select 1 from public.users u where lower(u.email) = e);
end;
$$;
