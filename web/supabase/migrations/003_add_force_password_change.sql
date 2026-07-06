-- =================================================================
-- Force password change flag for newly created accounts.
-- Set to true when a faculty member registers a student with a
-- generated temporary password. Cleared after the student changes it.
-- =================================================================

alter table public.users
add column if not exists force_password_change boolean not null default false;
