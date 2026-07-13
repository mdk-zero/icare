-- 019: Consolidate the two audit tables into audit_logs (manuscript F7).
--
-- The faculty Audit Trail page grew its own hand-created table
-- (faculty_audit_logs) that no migration ever defined, so the system had
-- two parallel audit trails — and on a fresh database the faculty page
-- broke. Fold any existing rows into the canonical append-only
-- audit_logs and drop the stray table. /api/faculty/audit now reads and
-- writes audit_logs.
--
-- Mapping: faculty_id → actor_id (null if the user no longer exists,
-- with the original name kept in details.actor_name), tab → entity_type,
-- target_id → entity_id; the free-text details string moves to
-- details.message alongside target_type and the old metadata.

do $$
begin
  if to_regclass('public.faculty_audit_logs') is not null then
    execute $sql$
      insert into public.audit_logs
        (actor_id, actor_role, action, entity_type, entity_id, details, created_at)
      select
        u.id,
        'faculty'::user_role,
        f.action,
        f.tab,
        f.target_id,
        jsonb_build_object(
          'message', f.details,
          'actor_name', f.faculty_name,
          'target_type', f.target_type,
          'migrated_from', 'faculty_audit_logs'
        ) || coalesce(f.metadata, '{}'::jsonb),
        f.created_at
      from public.faculty_audit_logs f
      left join public.users u on u.id::text = f.faculty_id::text
    $sql$;

    execute 'drop table public.faculty_audit_logs';
  end if;
end $$;
