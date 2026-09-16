-- =================================================================
-- 032: Record a user's sex on the account.
--
-- The mobile home screen now greets a student the way a ward would --
-- "Good morning, Ms. Santos" -- and nothing in the schema could say
-- whether that reads Mr. or Ms. `patients` has carried `gender` since
-- 004; `users` never did, because until now nothing addressed a user
-- by anything but their full name.
--
-- Nullable, and it stays null for every account that already exists.
-- The honorific renders only once someone has actually recorded one,
-- so no student is addressed wrongly by default -- the greeting falls
-- back to their name. Set from the faculty roster (add form and CSV
-- import) and the admin user form.
-- =================================================================

do $$ begin
  create type user_sex as enum ('male', 'female');
exception when duplicate_object then null; end $$;

alter table public.users
  add column if not exists sex user_sex;

comment on column public.users.sex is
  'Optional. Source of the Mr./Ms. honorific the mobile app greets a student with. Null means unrecorded, and no honorific is shown.';
