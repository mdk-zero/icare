-- =================================================================
-- 031: Detach audit_logs.actor_id from users, and restore strict
--      append-only.
--
-- 030 assumed the deployed FK matched 011's `on delete set null` and
-- taught the trigger to allow that one UPDATE. It did not help: the
-- trail still refused every user deletion with 'audit_logs is
-- append-only', and a dump of the trigger showed 030's function
-- installed and alone on the table. So the raise came from the DELETE
-- arm -- the deployed constraint cascades. 011 creates audit_logs with
-- `create table if not exists`, so a database where the table already
-- existed kept whatever ON DELETE rule it was first given.
--
-- Either rule is wrong here. SET NULL rewrites an append-only row;
-- CASCADE destroys the very history the trail exists to keep. An actor
-- id is a historical fact: it records who acted, not who still holds an
-- account. So the FK goes, and actor_id stays a plain uuid that outlives
-- the account it names.
--
-- Consequence for the API: PostgREST can no longer embed
-- `actor:users(name, email)` on audit_logs, because embedding needs a
-- real FK. /api/admin/audit and /api/faculty/audit now resolve actor
-- names with a second query instead.
-- =================================================================

-- Dropped by discovery rather than by name: the constraint predates the
-- migration that was supposed to define it, so its name is not known.
do $$
declare
  fk_name text;
begin
  select con.conname into fk_name
  from pg_constraint con
  where con.conrelid = 'public.audit_logs'::regclass
    and con.contype = 'f'
    and con.conkey = array[
      (select att.attnum
       from pg_attribute att
       where att.attrelid = 'public.audit_logs'::regclass
         and att.attname = 'actor_id')
    ];

  if fk_name is not null then
    execute format('alter table public.audit_logs drop constraint %I', fk_name);
  end if;
end $$;

-- With no FK there is no legitimate mutation left, so 030's exemption is
-- dead code. Back to the original: nothing may update or delete a row.
create or replace function public.reject_audit_mutation()
returns trigger as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$ language plpgsql;

drop trigger if exists trg_audit_logs_immutable on public.audit_logs;
create trigger trg_audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.reject_audit_mutation();

-- Proof the constraint is gone: expected to return zero rows.
select con.conname
from pg_constraint con
where con.conrelid = 'public.audit_logs'::regclass
  and con.contype = 'f';
