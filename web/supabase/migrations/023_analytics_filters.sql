-- =================================================================
-- 023: Section + date-range filtering for the analytics dashboards
--
-- Faculty see analytics for the sections they manage (faculty_sections),
-- over an arbitrary date range. Both filters are pushed into the warehouse
-- rather than applied after the fact:
--
--   1. dw.dim_student gains section_key/section_name, loaded by the ETL from
--      public.users.section_id -> public.sections.
--   2. public.dw_analytics_summary takes (sections, from, to, bucket). Every
--      parameter defaults to null/'week', so existing no-arg callers (the
--      admin dashboard, the self-heal route) keep their old behaviour:
--      whole cohort, 8-week trend, 30-day active count.
-- =================================================================

-- -----------------------------------------------------------------
-- 1. Section on the student dimension
-- -----------------------------------------------------------------

alter table dw.dim_student
  add column if not exists section_key uuid,
  add column if not exists section_name text;

create index if not exists idx_dim_student_section on dw.dim_student(section_key);

-- -----------------------------------------------------------------
-- 2. ETL: carry the section through the student load
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

  insert into dw.dim_student (student_key, name, email, campus_key, section_key, section_name)
  select u.id, u.name, u.email, u.campus_id, u.section_id, s.name
  from public.users u
  left join public.sections s on s.id = u.section_id
  where u.role = 'student'
  on conflict (student_key) do update
    set name = excluded.name, email = excluded.email, campus_key = excluded.campus_key,
        section_key = excluded.section_key, section_name = excluded.section_name;
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

-- -----------------------------------------------------------------
-- 3. Parameterised analytics summary
-- -----------------------------------------------------------------

-- The old no-arg version has to go: an all-defaults overload would make
-- dw_analytics_summary() ambiguous.
drop function if exists public.dw_analytics_summary();

create or replace function public.dw_analytics_summary(
  p_section_ids uuid[] default null,   -- null = every section
  p_from date default null,            -- null = no lower bound
  p_to date default null,              -- null = no upper bound
  p_bucket text default 'week'         -- trend granularity: day|week|month|year
)
returns jsonb
language plpgsql
stable
security definer
set search_path = dw, public
as $fn$
declare
  -- Facts are keyed by YYYYMMDD ints, so compare against the index rather
  -- than joining dim_date for every aggregate.
  from_key int := case when p_from is null then null else to_char(p_from, 'YYYYMMDD')::int end;
  to_key   int := case when p_to   is null then null else to_char(p_to,   'YYYYMMDD')::int end;
  bucket text := case when p_bucket in ('day', 'week', 'month', 'year') then p_bucket else 'week' end;
  -- null = whole cohort; otherwise the students in the requested sections
  -- (possibly empty, which correctly yields zeros).
  scope uuid[];
  -- Preserves the pre-023 no-arg behaviour when the caller gives no range.
  trend_from date := coalesce(p_from, (now() - interval '8 weeks')::date);
  active_from int := coalesce(from_key, to_char(now() - interval '30 days', 'YYYYMMDD')::int);
  result jsonb;
begin
  if p_section_ids is not null then
    select coalesce(array_agg(student_key), '{}'::uuid[]) into scope
    from dw.dim_student where section_key = any(p_section_ids);
  end if;

  select jsonb_build_object(
    'etl', (select jsonb_build_object('last_run_at', last_run_at, 'rows_loaded', rows_loaded)
            from dw.etl_state limit 1),
    'sections', (
      select coalesce(jsonb_agg(row order by row->>'name'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'id', section_key, 'name', section_name, 'students', count(*)
        ) as row
        from dw.dim_student
        where section_key is not null
          and (p_section_ids is null or section_key = any(p_section_ids))
        group by section_key, section_name
      ) s
    ),
    'cohort', (
      select jsonb_build_object(
        'total_students', (
          select count(*) from dw.dim_student ds
          where p_section_ids is null or ds.section_key = any(p_section_ids)
        ),
        'submitted_attempts', count(*) filter (where f.status = 'submitted'),
        'average_score', round(avg(f.score) filter (where f.status = 'submitted'), 1),
        'active_students_30d', count(distinct f.student_key)
          filter (where f.date_key >= active_from and (to_key is null or f.date_key <= to_key))
      )
      from dw.fact_assessment_attempts f
      where (scope is null or f.student_key = any(scope))
        and (from_key is null or f.date_key >= from_key)
        and (to_key is null or f.date_key <= to_key)
    ),
    -- Key stays `week_start` across granularities: it is the bucket's start date.
    'weekly_trend', (
      select coalesce(jsonb_agg(w order by w->>'week_start'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'week_start', to_char(date_trunc(bucket, d.full_date), 'YYYY-MM-DD'),
          'average_score', round(avg(f.score), 1),
          'attempts', count(*)
        ) as w
        from dw.fact_assessment_attempts f
        join dw.dim_date d on d.date_key = f.date_key
        where f.status = 'submitted'
          and d.full_date >= trend_from
          and (p_to is null or d.full_date <= p_to)
          and (scope is null or f.student_key = any(scope))
        group by date_trunc(bucket, d.full_date)
      ) buckets
    ),
    'competency_breakdown', (
      select coalesce(jsonb_object_agg(name, avg_score), '{}'::jsonb)
      from (
        select c.name, round(avg(f.score), 1) as avg_score
        from dw.fact_competency_scores f
        join dw.dim_competency c on c.competency_key = f.competency_key
        where (scope is null or f.student_key = any(scope))
          and (from_key is null or f.date_key >= from_key)
          and (to_key is null or f.date_key <= to_key)
        group by c.name
      ) comp
    ),
    'competency_detail', (
      select coalesce(jsonb_agg(row order by row->>'name'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'name', c.name,
          'ratings', count(*),
          'students', count(distinct f.student_key),
          'average_score', round(avg(f.score), 1),
          'pass_rate_pct', round(100.0 * count(*) filter (where f.score >= 75) / count(*), 1)
        ) as row
        from dw.fact_competency_scores f
        join dw.dim_competency c on c.competency_key = f.competency_key
        where (scope is null or f.student_key = any(scope))
          and (from_key is null or f.date_key >= from_key)
          and (to_key is null or f.date_key <= to_key)
        group by c.name
      ) detail
    ),
    -- Operational, not cohort analytics: rooms stay whole-campus and live.
    'room_utilization', (
      select coalesce(jsonb_agg(row order by row->>'room_number'), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'name', r.name,
          'room_number', r.room_number,
          'status', r.status::text,
          'capacity', r.capacity,
          'assigned', count(a.id),
          'utilization_pct',
            case when r.capacity > 0
                 then round(100.0 * count(a.id) / r.capacity, 0)
                 else 0 end
        ) as row
        from public.rooms r
        left join public.room_assignments a on a.room_id = r.id and a.ends_at is null
        group by r.id
      ) rooms
    ),
    'clinical_activity', (
      select jsonb_build_object(
        'vital_readings', (
          select count(*) from dw.fact_vital_readings v
          where (scope is null or v.student_key = any(scope))
            and (from_key is null or v.date_key >= from_key)
            and (to_key is null or v.date_key <= to_key)
        ),
        'anomalies', (
          select count(*) from dw.fact_vital_readings v
          where v.is_anomaly
            and (scope is null or v.student_key = any(scope))
            and (from_key is null or v.date_key >= from_key)
            and (to_key is null or v.date_key <= to_key)
        ),
        'tpr_entries', (select count(*) from dw.fact_clinical_tasks t where t.task_type = 'tpr'
          and (scope is null or t.student_key = any(scope))
          and (from_key is null or t.date_key >= from_key)
          and (to_key is null or t.date_key <= to_key)),
        'ivf_records', (select count(*) from dw.fact_clinical_tasks t where t.task_type = 'ivf'
          and (scope is null or t.student_key = any(scope))
          and (from_key is null or t.date_key >= from_key)
          and (to_key is null or t.date_key <= to_key)),
        'progress_notes', (select count(*) from dw.fact_clinical_tasks t where t.task_type = 'note'
          and (scope is null or t.student_key = any(scope))
          and (from_key is null or t.date_key >= from_key)
          and (to_key is null or t.date_key <= to_key)),
        'notes_reviewed', (select count(*) from dw.fact_clinical_tasks t
          where t.task_type = 'note' and t.reviewed
          and (scope is null or t.student_key = any(scope))
          and (from_key is null or t.date_key >= from_key)
          and (to_key is null or t.date_key <= to_key))
      )
    ),
    -- Risk is a current standing, not an in-range event: scoped by section,
    -- but always the latest prediction per student.
    'risk_distribution', (
      select coalesce(jsonb_object_agg(risk, cnt), '{}'::jsonb)
      from (
        select risk, count(*) as cnt
        from (
          select distinct on (p.student_key) p.student_key, p.risk
          from dw.fact_predictions p
          where scope is null or p.student_key = any(scope)
          order by p.student_key, p.date_key desc
        ) latest
        group by risk
      ) dist
    )
  ) into result;

  return result;
end;
$fn$;

revoke execute on function public.dw_analytics_summary(uuid[], date, date, text)
  from public, anon, authenticated;
grant execute on function public.dw_analytics_summary(uuid[], date, date, text) to service_role;
