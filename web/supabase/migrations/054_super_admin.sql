-- =================================================================
-- 054: Super admin, request telemetry and system test runs.
--
-- A super_admin manages every account and watches how the system performs;
-- the /admin Users page is gone and account management lives in
-- /super-admin. Regular admins keep their scoped student/faculty tools.
--
-- request_metrics holds one row per API call the web (and later mobile)
-- client made, timed from request to response headers. It feeds the
-- Response Time / Throughput / Reliability figures (manuscript Objective 3)
-- and is pruned to 30 days whenever the summary is read.
--
-- system_test_runs keeps the results of health checks, load benchmarks and
-- DW query benchmarks so the super admin can compare runs over time.
--
-- The first super admin is made by setting users.role in the developer
-- console row editor.
-- =================================================================

-- The new role. Postgres can't use an enum value inside the transaction
-- that added it; nothing below does, so one script is fine.
do $$
begin
  if exists (select 1 from pg_type where typname = 'user_role') then
    alter type public.user_role add value if not exists 'super_admin';
  end if;
end;
$$;

-- Some deployments carry a text column with a check constraint instead of
-- (or as well as) the enum. Widen any such constraint to the new role.
do $$
declare
  con record;
begin
  for con in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = 'users' and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%'
      and pg_get_constraintdef(c.oid) ilike '%''admin''%'
      and pg_get_constraintdef(c.oid) not ilike '%super_admin%'
  loop
    execute format('alter table public.users drop constraint %I', con.conname);
    execute format(
      'alter table public.users add constraint %I check (role::text in (''student'', ''faculty'', ''admin'', ''super_admin''))',
      con.conname
    );
  end loop;
end;
$$;

-- -----------------------------------------------------------------
-- Request telemetry
-- -----------------------------------------------------------------
create table if not exists public.request_metrics (
  id bigserial primary key,
  recorded_at timestamptz not null default now(),
  method text not null,
  route text not null,          -- ids normalised to :id, no query string
  status int not null,          -- 0 = network error / no response
  duration_ms int not null,
  source text not null default 'web' check (source in ('web', 'mobile', 'benchmark')),
  role text
);

create index if not exists idx_request_metrics_recorded on public.request_metrics(recorded_at);

alter table public.request_metrics enable row level security;

-- -----------------------------------------------------------------
-- Test runs
-- -----------------------------------------------------------------
create table if not exists public.system_test_runs (
  id uuid primary key default gen_random_uuid(),
  -- e2e = Playwright, api = Postman/Newman; both reported by web/tests/report.mjs.
  kind text not null check (kind in ('benchmark', 'dw_benchmark', 'health', 'e2e', 'api')),
  run_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  summary jsonb not null default '{}'::jsonb,
  results jsonb not null default '[]'::jsonb
);

-- A deployment that applied an earlier draft of this file has the narrower
-- kind check; widen it to the test-suite kinds.
do $$
declare
  con record;
begin
  for con in
    select c.conname from pg_constraint c
    where c.conrelid = 'public.system_test_runs'::regclass and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%kind%'
      and pg_get_constraintdef(c.oid) not ilike '%e2e%'
  loop
    execute format('alter table public.system_test_runs drop constraint %I', con.conname);
    alter table public.system_test_runs
      add constraint system_test_runs_kind_check
      check (kind in ('benchmark', 'dw_benchmark', 'health', 'e2e', 'api'));
  end loop;
end;
$$;

create index if not exists idx_system_test_runs_kind on public.system_test_runs(kind, created_at desc);

alter table public.system_test_runs enable row level security;

-- -----------------------------------------------------------------
-- Summary: time-bucketed p50/p95/throughput/error rate plus a per-route
-- rollup, for everything since p_since. Errors are 5xx and network
-- failures (status 0); a 4xx is the client's mistake, not an outage.
-- -----------------------------------------------------------------
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
      from public.request_metrics where recorded_at >= p_since
    ),
    'series', coalesce((
      select jsonb_agg(row order by row->>'bucket')
      from (
        select jsonb_build_object(
          'bucket', date_trunc(bucket, recorded_at),
          'requests', count(*),
          'p50_ms', round(percentile_cont(0.5) within group (order by duration_ms)),
          'p95_ms', round(percentile_cont(0.95) within group (order by duration_ms)),
          'errors', count(*) filter (where status >= 500 or status = 0)
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
        where recorded_at >= p_since
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

-- -----------------------------------------------------------------
-- DW query benchmark: the six workloads of supabase/benchmarks/
-- dw_benchmark.sql, each timed server-side. A query that fails (a table
-- missing on this deployment) reports its error instead of sinking the run.
-- -----------------------------------------------------------------
create or replace function public.super_admin_dw_benchmark()
returns table (query_id text, label text, duration_ms numeric, row_count bigint, error text)
language plpgsql
security definer
set search_path = dw, public
as $fn$
declare
  q record;
  started timestamptz;
  n bigint;
begin
  for q in
    select * from (values
      ('Q1', 'Cohort weekly score trend',
       $q$select date_trunc('week', d.full_date), round(avg(f.score), 1), count(*)
          from dw.fact_assessment_attempts f
          join dw.dim_date d on d.date_key = f.date_key
          where f.status = 'submitted' group by 1$q$),
      ('Q2', 'Competency pass rates',
       $q$select c.name, count(*), round(avg(f.score), 1),
                 round(100.0 * count(*) filter (where f.score >= 75) / count(*), 1)
          from dw.fact_competency_scores f
          join dw.dim_competency c on c.competency_key = f.competency_key
          group by c.name$q$),
      ('Q3', 'Per-student performance rollup',
       $q$select s.name, count(f.attempt_key) filter (where f.status = 'submitted'),
                 round(avg(f.score) filter (where f.status = 'submitted'), 1), max(f.date_key)
          from dw.dim_student s
          left join dw.fact_assessment_attempts f on f.student_key = s.student_key
          group by s.student_key, s.name$q$),
      ('Q4', 'Vitals anomaly rate by month per campus',
       $q$select c.code, d.year, d.month, count(*), count(*) filter (where f.is_anomaly)
          from dw.fact_vital_readings f
          join dw.dim_date d on d.date_key = f.date_key
          left join dw.dim_campus c on c.campus_key = f.campus_key
          group by c.code, d.year, d.month$q$),
      ('Q5', 'Latest at-risk prediction per student',
       $q$select s.name, latest.risk, latest.probability
          from (select distinct on (student_key) student_key, risk, probability
                from dw.fact_predictions order by student_key, date_key desc) latest
          join dw.dim_student s on s.student_key = latest.student_key
          where latest.risk = 'at_risk'$q$),
      ('Q6', 'Full dashboard payload',
       $q$select public.dw_analytics_summary()$q$)
    ) as v(id, name, sql)
  loop
    query_id := q.id;
    label := q.name;
    error := null;
    begin
      started := clock_timestamp();
      execute format('select count(*) from (%s) t', q.sql) into n;
      duration_ms := round(extract(epoch from clock_timestamp() - started) * 1000, 2);
      row_count := n;
    exception when others then
      duration_ms := null;
      row_count := null;
      error := sqlerrm;
    end;
    return next;
  end loop;
end;
$fn$;

revoke execute on function public.super_admin_dw_benchmark() from public, anon, authenticated;
grant execute on function public.super_admin_dw_benchmark() to service_role;
