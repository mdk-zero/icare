-- 076: Tokens per AI provider call.
--
-- 060 counts every call the server makes to an AI provider, but not how big
-- each one was, so the System Dashboard couldn't say how many tokens the app
-- spends or what that costs. app/lib/ai/record.ts now reads the token counts
-- each provider returns with its answer and stores them on the call's row.
-- Calls logged before 076, and calls that failed, have no counts (null).
--
-- super_admin_ai_usage sums them per provider/model over a window. Prices
-- aren't stored: the dashboard multiplies by the list rates in
-- app/lib/ai/pricing.ts, so a price change applies to the whole window.
-- Rows are pruned after 30 days (super_admin_metrics_summary), so that is the
-- longest window there is.

alter table public.request_metrics add column if not exists input_tokens integer;
alter table public.request_metrics add column if not exists output_tokens integer;

create or replace function public.super_admin_ai_usage(p_since timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $fn$
  select coalesce(jsonb_agg(row order by (row->>'requests')::bigint desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
      'route', route,
      'requests', count(*),
      -- As in 060: a provider 429 is a spent quota.
      'errors', count(*) filter (where status >= 400 or status = 0),
      'metered', count(input_tokens),
      'input_tokens', coalesce(sum(input_tokens), 0),
      'output_tokens', coalesce(sum(output_tokens), 0)
    ) as row
    from public.request_metrics
    where source = 'ai' and recorded_at >= p_since
    group by route
  ) r;
$fn$;

revoke execute on function public.super_admin_ai_usage(timestamptz) from public, anon, authenticated;
grant execute on function public.super_admin_ai_usage(timestamptz) to service_role;
