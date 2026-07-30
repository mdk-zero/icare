-- =================================================================
-- 028: Live delivery for the notification feed (011)
--
-- The feed was read-on-mount only: a notification inserted by faculty
-- didn't reach a signed-in student until they refreshed. Publishing the
-- table through `supabase_realtime` lets /api/notifications/stream
-- subscribe to its WAL changes and push them to web + mobile over SSE.
--
-- The API subscribes with the service-role key, so the RLS policies in
-- 011 (which key off auth.uid(), unused by this app's JWT sessions) do
-- not gate delivery; the stream endpoint scopes rows to the caller.
-- =================================================================

do $$
begin
  -- Self-hosted/local stacks may not have the publication yet.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    execute 'alter publication supabase_realtime add table public.notifications';
  end if;
end $$;
