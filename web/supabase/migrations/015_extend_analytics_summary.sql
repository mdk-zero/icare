-- =================================================================
-- 015: Extend dw_analytics_summary for the dashboards (Phase 2.10)
--
-- Adds to the payload from 014 (existing keys unchanged):
--   competency_detail  per-competency ratings/students/avg/pass rate
--                      (pass = score >= 75, the College's passing mark)
--   room_utilization   active occupancy per room (reads OLTP rooms +
--                      room_assignments — operational data that should
--                      stay live rather than wait for the nightly ETL)
-- =================================================================

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
      'vital_readings', (select count(*) from dw.fact_vital_readings),
      'anomalies', (select count(*) from dw.fact_vital_readings where is_anomaly),
      'tpr_entries', (select count(*) from dw.fact_clinical_tasks where task_type = 'tpr'),
      'ivf_records', (select count(*) from dw.fact_clinical_tasks where task_type = 'ivf'),
      'progress_notes', (select count(*) from dw.fact_clinical_tasks where task_type = 'note'),
      'notes_reviewed', (select count(*) from dw.fact_clinical_tasks where task_type = 'note' and reviewed)
    )
  ),
  'risk_distribution', (
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
