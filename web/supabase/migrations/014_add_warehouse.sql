-- =================================================================
-- 014: Star-schema data warehouse (manuscript F5, Objective 2.4;
--      PLAN Phase 4.1–4.3)
--
-- Lives in a dedicated `dw` schema in the same Postgres. Every fact
-- and dim row carries campus_key so the repository is multi-campus
-- ready. Loaded by dw.run_etl(): full idempotent upserts keyed by the
-- OLTP primary keys — at capstone data volumes a full upsert pass is
-- cheaper and safer than watermark bookkeeping, and re-running is
-- always safe.
--
-- API access goes through SECURITY DEFINER wrappers in `public`
-- (public.run_dw_etl, public.dw_analytics_summary) because Supabase
-- only exposes RPC on the public schema by default.
-- =================================================================

create schema if not exists dw;

grant usage on schema dw to service_role;
alter default privileges in schema dw grant select on tables to service_role;

-- -----------------------------------------------------------------
-- Dimensions
-- -----------------------------------------------------------------

create table if not exists dw.dim_date (
  date_key int primary key,              -- yyyymmdd
  full_date date not null unique,
  year int not null,
  quarter int not null,
  month int not null,
  month_name text not null,
  day int not null,
  day_of_week int not null,              -- 0 = Sunday
  week_of_year int not null
);

insert into dw.dim_date
select
  to_char(d, 'YYYYMMDD')::int,
  d,
  extract(year from d)::int,
  extract(quarter from d)::int,
  extract(month from d)::int,
  to_char(d, 'Month'),
  extract(day from d)::int,
  extract(dow from d)::int,
  extract(week from d)::int
from generate_series('2024-01-01'::date, '2030-12-31'::date, interval '1 day') as d
on conflict (date_key) do nothing;

create table if not exists dw.dim_campus (
  campus_key uuid primary key,           -- = public.campuses.id
  name text not null,
  code text not null
);

create table if not exists dw.dim_student (
  student_key uuid primary key,          -- = public.users.id
  name text not null,
  email text not null,
  campus_key uuid
);

create table if not exists dw.dim_faculty (
  faculty_key uuid primary key,
  name text not null,
  email text not null,
  campus_key uuid
);

create table if not exists dw.dim_room (
  room_key uuid primary key,
  name text not null,
  room_number text not null,
  capacity int not null,
  status text not null,
  campus_key uuid
);

create table if not exists dw.dim_competency (
  competency_key uuid primary key,
  name text not null
);

create table if not exists dw.dim_assessment (
  assessment_key uuid primary key,
  title text not null,
  difficulty text not null,
  category text not null,
  is_ai_generated boolean not null default false
);

-- -----------------------------------------------------------------
-- Facts
-- -----------------------------------------------------------------

create table if not exists dw.fact_assessment_attempts (
  attempt_key uuid primary key,          -- = assessment_attempts.id
  student_key uuid not null,
  assessment_key uuid not null,
  campus_key uuid,
  date_key int not null,
  score numeric(5,2),
  time_taken_seconds int,
  status text not null
);

create index if not exists idx_fact_attempts_student on dw.fact_assessment_attempts(student_key);
create index if not exists idx_fact_attempts_date on dw.fact_assessment_attempts(date_key);

create table if not exists dw.fact_vital_readings (
  reading_key uuid primary key,
  student_key uuid not null,
  campus_key uuid,
  date_key int not null,
  is_anomaly boolean not null,
  anomaly_count int not null default 0
);

create index if not exists idx_fact_vitals_student on dw.fact_vital_readings(student_key);
create index if not exists idx_fact_vitals_date on dw.fact_vital_readings(date_key);

create table if not exists dw.fact_clinical_tasks (
  task_key uuid primary key,             -- = tpr/ivf/notes row id
  student_key uuid not null,
  campus_key uuid,
  date_key int not null,
  task_type text not null,               -- 'tpr' | 'ivf' | 'note'
  reviewed boolean not null default false
);

create index if not exists idx_fact_tasks_student on dw.fact_clinical_tasks(student_key);
create index if not exists idx_fact_tasks_type on dw.fact_clinical_tasks(task_type);

create table if not exists dw.fact_competency_scores (
  score_key uuid primary key,
  student_key uuid not null,
  competency_key uuid not null,
  faculty_key uuid,
  campus_key uuid,
  date_key int not null,
  score numeric(5,2) not null,
  source text not null
);

create index if not exists idx_fact_compscores_student on dw.fact_competency_scores(student_key);
create index if not exists idx_fact_compscores_competency on dw.fact_competency_scores(competency_key);

create table if not exists dw.fact_predictions (
  prediction_key uuid primary key,
  student_key uuid not null,
  campus_key uuid,
  date_key int not null,
  model_kind text,
  model_version text,
  risk text not null,
  probability numeric(5,4)
);

create index if not exists idx_fact_predictions_student on dw.fact_predictions(student_key);
create index if not exists idx_fact_predictions_date on dw.fact_predictions(date_key);

create table if not exists dw.etl_state (
  id boolean primary key default true check (id),  -- single row
  last_run_at timestamptz,
  last_run_duration_ms int,
  rows_loaded jsonb not null default '{}'::jsonb
);

insert into dw.etl_state (id) values (true) on conflict (id) do nothing;

-- -----------------------------------------------------------------
-- ETL
-- -----------------------------------------------------------------

create or replace function dw.run_etl()
returns jsonb
language plpgsql
as $etl$
declare
  started timestamptz := clock_timestamp();
  counts jsonb := '{}'::jsonb;
  n bigint;
begin
  -- Dimensions -----------------------------------------------------
  insert into dw.dim_campus (campus_key, name, code)
  select id, name, code from public.campuses
  on conflict (campus_key) do update set name = excluded.name, code = excluded.code;

  insert into dw.dim_student (student_key, name, email, campus_key)
  select id, name, email, campus_id from public.users where role = 'student'
  on conflict (student_key) do update
    set name = excluded.name, email = excluded.email, campus_key = excluded.campus_key;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('dim_student', n);

  insert into dw.dim_faculty (faculty_key, name, email, campus_key)
  select id, name, email, campus_id from public.users where role in ('faculty', 'admin')
  on conflict (faculty_key) do update
    set name = excluded.name, email = excluded.email, campus_key = excluded.campus_key;

  insert into dw.dim_room (room_key, name, room_number, capacity, status, campus_key)
  select id, name, room_number, capacity, status::text, campus_id from public.rooms
  on conflict (room_key) do update
    set name = excluded.name, room_number = excluded.room_number,
        capacity = excluded.capacity, status = excluded.status,
        campus_key = excluded.campus_key;

  insert into dw.dim_competency (competency_key, name)
  select id, name from public.competency_areas
  on conflict (competency_key) do update set name = excluded.name;

  insert into dw.dim_assessment (assessment_key, title, difficulty, category, is_ai_generated)
  select id, title, difficulty::text, category::text, is_ai_generated from public.assessments
  on conflict (assessment_key) do update
    set title = excluded.title, difficulty = excluded.difficulty,
        category = excluded.category, is_ai_generated = excluded.is_ai_generated;

  -- Facts ----------------------------------------------------------
  insert into dw.fact_assessment_attempts
    (attempt_key, student_key, assessment_key, campus_key, date_key, score, time_taken_seconds, status)
  select a.id, a.student_id, a.assessment_id, u.campus_id,
         to_char(coalesce(a.submitted_at, a.created_at), 'YYYYMMDD')::int,
         a.score, a.time_taken_seconds, a.status::text
  from public.assessment_attempts a
  join public.users u on u.id = a.student_id
  on conflict (attempt_key) do update
    set score = excluded.score, time_taken_seconds = excluded.time_taken_seconds,
        status = excluded.status, date_key = excluded.date_key;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('fact_assessment_attempts', n);

  insert into dw.fact_vital_readings
    (reading_key, student_key, campus_key, date_key, is_anomaly, anomaly_count)
  select v.id, v.recorded_by, u.campus_id,
         to_char(v.recorded_at, 'YYYYMMDD')::int,
         v.is_anomaly, coalesce(jsonb_array_length(v.anomaly_reasons), 0)
  from public.vital_sign_readings v
  join public.users u on u.id = v.recorded_by
  on conflict (reading_key) do update
    set is_anomaly = excluded.is_anomaly, anomaly_count = excluded.anomaly_count;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('fact_vital_readings', n);

  insert into dw.fact_clinical_tasks (task_key, student_key, campus_key, date_key, task_type, reviewed)
  select t.id, t.recorded_by, u.campus_id, to_char(t.created_at, 'YYYYMMDD')::int, 'tpr', false
  from public.tpr_records t join public.users u on u.id = t.recorded_by
  union all
  select i.id, i.recorded_by, u.campus_id, to_char(i.created_at, 'YYYYMMDD')::int, 'ivf', false
  from public.ivf_records i join public.users u on u.id = i.recorded_by
  union all
  select p.id, p.author_id, u.campus_id, to_char(p.created_at, 'YYYYMMDD')::int, 'note',
         p.reviewed_at is not null
  from public.progress_notes p join public.users u on u.id = p.author_id
  on conflict (task_key) do update set reviewed = excluded.reviewed;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('fact_clinical_tasks', n);

  insert into dw.fact_competency_scores
    (score_key, student_key, competency_key, faculty_key, campus_key, date_key, score, source)
  select c.id, c.student_id, c.competency_id, c.faculty_id, u.campus_id,
         to_char(c.created_at, 'YYYYMMDD')::int, c.score, c.source::text
  from public.competency_scores c
  join public.users u on u.id = c.student_id
  on conflict (score_key) do update set score = excluded.score;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('fact_competency_scores', n);

  insert into dw.fact_predictions
    (prediction_key, student_key, campus_key, date_key, model_kind, model_version, risk, probability)
  select p.id, p.student_id, u.campus_id,
         to_char(p.predicted_at, 'YYYYMMDD')::int,
         m.kind::text, m.version, p.risk::text, p.probability
  from public.performance_predictions p
  join public.users u on u.id = p.student_id
  left join public.ml_models m on m.id = p.model_id
  on conflict (prediction_key) do nothing;
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('fact_predictions', n);

  update dw.etl_state
  set last_run_at = now(),
      last_run_duration_ms = (extract(epoch from clock_timestamp() - started) * 1000)::int,
      rows_loaded = counts
  where id;

  return counts;
end;
$etl$;

-- Public RPC wrapper (Supabase exposes RPC on `public` only).
create or replace function public.run_dw_etl()
returns jsonb
language sql
security definer
set search_path = dw, public
as $$ select dw.run_etl(); $$;

revoke execute on function public.run_dw_etl() from public, anon, authenticated;
grant execute on function public.run_dw_etl() to service_role;

-- -----------------------------------------------------------------
-- Analytics summary consumed by the admin/faculty dashboards (2.10)
-- -----------------------------------------------------------------

create or replace function public.dw_analytics_summary()
returns jsonb
language sql
stable
security definer
set search_path = dw, public
as $$
select jsonb_build_object(
  'etl', (select jsonb_build_object('last_run_at', last_run_at, 'rows_loaded', rows_loaded)
          from dw.etl_state limit 1),
  'cohort', (
    select jsonb_build_object(
      'total_students', (select count(*) from dw.dim_student),
      'submitted_attempts', count(*) filter (where f.status = 'submitted'),
      'average_score', round(avg(f.score) filter (where f.status = 'submitted'), 1),
      'active_students_30d', (
        select count(distinct student_key) from dw.fact_assessment_attempts
        where date_key >= to_char(now() - interval '30 days', 'YYYYMMDD')::int
      )
    )
    from dw.fact_assessment_attempts f
  ),
  'weekly_trend', (
    select coalesce(jsonb_agg(w order by w->>'week_start'), '[]'::jsonb)
    from (
      select jsonb_build_object(
        'week_start', to_char(date_trunc('week', d.full_date), 'YYYY-MM-DD'),
        'average_score', round(avg(f.score), 1),
        'attempts', count(*)
      ) as w
      from dw.fact_assessment_attempts f
      join dw.dim_date d on d.date_key = f.date_key
      where f.status = 'submitted'
        and d.full_date >= (now() - interval '8 weeks')::date
      group by date_trunc('week', d.full_date)
    ) weekly
  ),
  'competency_breakdown', (
    select coalesce(jsonb_object_agg(name, avg_score), '{}'::jsonb)
    from (
      select c.name, round(avg(f.score), 1) as avg_score
      from dw.fact_competency_scores f
      join dw.dim_competency c on c.competency_key = f.competency_key
      group by c.name
    ) comp
  ),
  'clinical_activity', (
    select jsonb_build_object(
      'vital_readings', (select count(*) from dw.fact_vital_readings),
      'anomalies', (select count(*) from dw.fact_vital_readings where is_anomaly),
      'tpr_entries', (select count(*) from dw.fact_clinical_tasks where task_type = 'tpr'),
      'ivf_records', (select count(*) from dw.fact_clinical_tasks where task_type = 'ivf'),
      'progress_notes', (select count(*) from dw.fact_clinical_tasks where task_type = 'note'),
      'notes_reviewed', (select count(*) from dw.fact_clinical_tasks where task_type = 'note' and reviewed)
    )
  ),
  'risk_distribution', (
    -- Latest prediction per student; empty until the ML service (Phase 3) writes predictions.
    select coalesce(jsonb_object_agg(risk, cnt), '{}'::jsonb)
    from (
      select risk, count(*) as cnt
      from (
        select distinct on (student_key) student_key, risk
        from dw.fact_predictions
        order by student_key, date_key desc
      ) latest
      group by risk
    ) dist
  )
);
$$;

revoke execute on function public.dw_analytics_summary() from public, anon, authenticated;
grant execute on function public.dw_analytics_summary() to service_role;

-- -----------------------------------------------------------------
-- Nightly refresh via pg_cron when the extension is available
-- (Supabase: enable pg_cron in Dashboard → Database → Extensions).
-- Safe no-op otherwise; the API can always trigger public.run_dw_etl().
-- -----------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('dw-nightly-etl', '15 2 * * *', 'select dw.run_etl()');
  end if;
exception when others then
  raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end $$;
