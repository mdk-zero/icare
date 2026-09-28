-- 060: AI provider calls in request telemetry.
--
-- request_metrics only held what browsers saw of the app's own /api routes;
-- the Gemini and OpenRouter calls the server makes behind them were
-- invisible, so the dashboard couldn't show how much of the traffic spends
-- the providers' small free quota. The server now records every provider
-- call (retries and fallbacks included) as source = 'ai', with the route
-- set to "<provider>/<model>" (app/lib/ai/record.ts).
--
-- AI rows stay out of the app figures (totals, latency, routes) so a 20 s
-- generation doesn't read as a slow API; the series carries a separate
-- ai_requests count per bucket and the summary an `ai` totals object.

alter table public.request_metrics drop constraint if exists request_metrics_source_check;
alter table public.request_metrics
  add constraint request_metrics_source_check check (source in ('web', 'mobile', 'benchmark', 'ai'));

create or replace function public.super_admin_metrics_summary(
  p_since timestamptz,
  p_bucket text default 'hour'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  bucket text := case when p_bucket in ('minute', 'hour', 'day') then p_bucket else 'hour' end;
  result jsonb;
begin
  delete from public.request_metrics where recorded_at < now() - interval '30 days';

  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'requests', count(*),
        'avg_ms', round(avg(duration_ms)),
        'p50_ms', round(percentile_cont(0.5) within group (order by duration_ms)),
        'p95_ms', round(percentile_cont(0.95) within group (order by duration_ms)),
        'errors', count(*) filter (where status >= 500 or status = 0)
      )
      from public.request_metrics where recorded_at >= p_since and source <> 'ai'
    ),
    'ai', (
      select jsonb_build_object(
        'requests', count(*),
        'p50_ms', round(percentile_cont(0.5) within group (order by duration_ms)),
        'p95_ms', round(percentile_cont(0.95) within group (order by duration_ms)),
        -- A provider 429 is a spent quota, which is what this is watched for.
        'errors', count(*) filter (where status >= 400 or status = 0)
      )
      from public.request_metrics where recorded_at >= p_since and source = 'ai'
    ),
    'series', coalesce((
      select jsonb_agg(row order by row->>'bucket')
      from (
        select jsonb_build_object(
          'bucket', date_trunc(bucket, recorded_at),
          'requests', count(*) filter (where source <> 'ai'),
          'p50_ms', round(percentile_cont(0.5) within group (order by duration_ms) filter (where source <> 'ai')),
          'p95_ms', round(percentile_cont(0.95) within group (order by duration_ms) filter (where source <> 'ai')),
          'errors', count(*) filter (where source <> 'ai' and (status >= 500 or status = 0)),
          'ai_requests', count(*) filter (where source = 'ai')
        ) as row
        from public.request_metrics
        where recorded_at >= p_since
        group by date_trunc(bucket, recorded_at)
      ) s
    ), '[]'::jsonb),
    'routes', coalesce((
      select jsonb_agg(row order by (row->>'p95_ms')::numeric desc)
      from (
        select jsonb_build_object(
          'method', method,
          'route', route,
          'requests', count(*),
          'p50_ms', round(percentile_cont(0.5) within group (order by duration_ms)),
          'p95_ms', round(percentile_cont(0.95) within group (order by duration_ms)),
          'errors', count(*) filter (where status >= 500 or status = 0)
        ) as row
        from public.request_metrics
        where recorded_at >= p_since and source <> 'ai'
        group by method, route
      ) r
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$fn$;

revoke execute on function public.super_admin_metrics_summary(timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.super_admin_metrics_summary(timestamptz, text) to service_role;
