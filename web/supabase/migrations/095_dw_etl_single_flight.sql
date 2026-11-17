-- =================================================================
-- 095: One warehouse refresh at a time, on a schedule.
--
-- Analytics refreshed the warehouse (run_dw_etl) from inside a dashboard
-- request whenever it was over five minutes old. The app only kept one
-- refresh at a time per server instance, so under load several instances
-- refreshed at once: the load test of 2026-11-17 caught two waiting on each
-- other's locks until one hit the statement timeout, failed, and left the
-- warehouse stale for the next request to try again.
--
-- run_dw_etl_once() refreshes only when no other refresh is running, and
-- otherwise returns at once with {"skipped": true}. The app calls it in the
-- background now, and pg_cron calls it every five minutes, so dashboards
-- read a fresh warehouse without waiting for one.
--
-- pg_cron is free on Supabase but off by default: Dashboard → Database →
-- Extensions → pg_cron, then run this file (again). Without it the app still
-- refreshes, one instance at a time.
-- =================================================================

create or replace function public.run_dw_etl_once()
returns jsonb
language plpgsql
security definer
set search_path = dw, public
as $fn$
begin
  -- Held until this transaction ends; a refresh already running keeps it.
  if not pg_try_advisory_xact_lock(hashtext('icare.dw_etl')) then
    return jsonb_build_object('skipped', true);
  end if;
  return public.run_dw_etl();
end;
$fn$;

revoke execute on function public.run_dw_etl_once() from public, anon, authenticated;
grant execute on function public.run_dw_etl_once() to service_role;

-- -----------------------------------------------------------------
-- Every five minutes via pg_cron, when the extension is enabled. This
-- replaces 014's nightly job, which ran dw.run_etl() alone: since 085 the
-- refresh also loads the graded work and prunes, and only run_dw_etl() does.
-- -----------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'dw-nightly-etl') then
      perform cron.unschedule('dw-nightly-etl');
    end if;
    if exists (select 1 from cron.job where jobname = 'icare-dw-etl') then
      perform cron.unschedule('icare-dw-etl');
    end if;
    perform cron.schedule('icare-dw-etl', '*/5 * * * *', 'select public.run_dw_etl_once()');
  else
    raise notice 'pg_cron is not enabled; enable it and run 095 again to schedule the warehouse refresh';
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;
