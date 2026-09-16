-- =================================================================
-- 036: Per-section active-student counts + a top-performers list for
-- the faculty analytics dashboard's redesign.
--
-- Both pieces reuse data the warehouse already has:
--   - dw.dim_student.section_key/section_name (023) for the per-section
--     breakdown of the same 30-day activity window `cohort.active_students_30d`
--     already uses.
--   - dw.fact_assessment_attempts for a ranked-by-average-score student list,
--     scoped by the same section/date filters as everything else here.
--
-- Full copy-and-modify of 023's function body (plpgsql CREATE OR REPLACE
-- can't patch just one key of the jsonb_build_object) — diff against 023 is
-- the `sections` subquery (now counts active_students alongside students)
-- and the new `top_students` key.
-- =================================================================

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
  from_key int := case when p_from is null then null else to_char(p_from, 'YYYYMMDD')::int end;
  to_key   int := case when p_to   is null then null else to_char(p_to,   'YYYYMMDD')::int end;
  bucket text := case when p_bucket in ('day', 'week', 'month', 'year') then p_bucket else 'week' end;
  scope uuid[];
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
          'id', ds.section_key,
          'name', ds.section_name,
          'students', count(distinct ds.student_key),
          'active_students', count(distinct f.student_key) filter (
            where f.date_key >= active_from and (to_key is null or f.date_key <= to_key)
          )
        ) as row
        from dw.dim_student ds
        left join dw.fact_assessment_attempts f on f.student_key = ds.student_key
          and (from_key is null or f.date_key >= from_key)
          and (to_key is null or f.date_key <= to_key)
        where ds.section_key is not null
          and (p_section_ids is null or ds.section_key = any(p_section_ids))
        group by ds.section_key, ds.section_name
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
    ),
    -- New: ranked by average submitted score, so the dashboard can show who
    -- is doing best under the same section/date scope as everything else.
    'top_students', (
      select coalesce(jsonb_agg(row), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'student_key', ds.student_key,
          'name', ds.name,
          'section', ds.section_name,
          'average_score', round(avg(f.score), 1),
          'attempts', count(*)
        ) as row
        from dw.fact_assessment_attempts f
        join dw.dim_student ds on ds.student_key = f.student_key
        where f.status = 'submitted'
          and (scope is null or f.student_key = any(scope))
          and (from_key is null or f.date_key >= from_key)
          and (to_key is null or f.date_key <= to_key)
        group by ds.student_key, ds.name, ds.section_name
        order by avg(f.score) desc, count(*) desc
        limit 10
      ) top
    ),
    -- New: which model is actually issuing the risk labels above, so the
    -- dashboard's offline accuracy figure (shipped with the web app, not
    -- computed here — there is no ground-truth outcome column to score
    -- predictions against) can be labelled with the model it describes.
    'active_model', (
      select jsonb_build_object('kind', p.model_kind, 'version', p.model_version)
      from dw.fact_predictions p
      order by p.date_key desc
      limit 1
    )
  ) into result;

  return result;
end;
$fn$;

revoke execute on function public.dw_analytics_summary(uuid[], date, date, text)
  from public, anon, authenticated;
grant execute on function public.dw_analytics_summary(uuid[], date, date, text) to service_role;
