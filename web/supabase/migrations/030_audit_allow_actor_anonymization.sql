-- =================================================================
-- 030: Let a deleted user be anonymised in the audit trail.
--
-- audit_logs.actor_id is `references users(id) on delete set null`, so
-- removing a user asks Postgres to UPDATE that user's audit rows. The
-- append-only trigger from 011 rejects every UPDATE, so the cascade
-- raised 'audit_logs is append-only' and the delete failed: any account
-- that had ever been logged -- which is every account that logged in --
-- could not be removed. It surfaced on the admin roster's batch delete,
-- but single-user deletion was broken the same way.
--
-- The trail stays immutable in substance. What was done, to what, when,
-- from where and under which role all remain; only the pointer to an
-- account that no longer exists is cleared, which is exactly what the
-- ON DELETE SET NULL was written to promise.
-- =================================================================

create or replace function public.reject_audit_mutation()
returns trigger as $$
begin
  -- NEW is unassigned on DELETE, so the operation is checked before any
  -- column of it is read.
  if tg_op = 'UPDATE' then
    -- Anonymisation only: actor_id may go from an id to null, and every
    -- other column must be byte-for-byte what it was.
    if old.actor_id is not null
       and new.actor_id is null
       and to_jsonb(new) - 'actor_id' = to_jsonb(old) - 'actor_id'
    then
      return new;
    end if;
  end if;

  raise exception 'audit_logs is append-only';
end;
$$ language plpgsql;

-- The trigger itself is unchanged; it already points at this function.
-- Recreated only so a database that missed 011's version still gets it.
drop trigger if exists trg_audit_logs_immutable on public.audit_logs;
create trigger trg_audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function public.reject_audit_mutation();
