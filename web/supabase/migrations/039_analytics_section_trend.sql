-- =================================================================
-- 039: Per-section score trend for the faculty analytics page.
--
-- "Classroom Performance Overview" draws one line per section (BSN 1101,
-- BSN 1102, ...) instead of one cohort line. This is 036's `weekly_trend`
-- split by the student's section: same submitted-attempt facts, same bucket
-- truncation, same window (from, or the last 8 weeks when there is no from,
-- through to) — so the section lines and the old cohort line describe the
-- same attempts.
--
-- A separate function rather than another key on dw_analytics_summary, so
-- this doesn't need a full copy of that function's body; the summary API
-- route calls both and attaches this as `section_trend`. Students with no
-- section have no line to belong to and are left out.
-- =================================================================

create or replace function public.dw_section_trend(
  p_section_ids uuid[] default null,   -- null = every section
  p_from date default null,            -- null = the last 8 weeks
  p_to date default null,              -- null = no upper bound
  p_bucket text default 'week'         -- day|week|month|year
)
returns jsonb
language plpgsql
stable
security definer
set search_path = dw, public
as $fn$
declare
  bucket text := case when p_bucket in ('day', 'week', 'month', 'year') then p_bucket else 'week' end;
  trend_from date := coalesce(p_from, (now() - interval '8 weeks')::date);
begin
  return (
    select coalesce(
      jsonb_agg(t.row order by t.section_name, t.bucket_start),
      '[]'::jsonb
    )
    from (
      select
        ds.section_name,
        date_trunc(bucket, d.full_date) as bucket_start,
        jsonb_build_object(
          'section_id', ds.section_key,
          'section_name', ds.section_name,
          'week_start', to_char(date_trunc(bucket, d.full_date), 'YYYY-MM-DD'),
          'average_score', round(avg(f.score), 1),
          'attempts', count(*)
        ) as row
      from dw.fact_assessment_attempts f
      join dw.dim_date d on d.date_key = f.date_key
      join dw.dim_student ds on ds.student_key = f.student_key
      where f.status = 'submitted'
        and ds.section_key is not null
        and (p_section_ids is null or ds.section_key = any(p_section_ids))
        and d.full_date >= trend_from
        and (p_to is null or d.full_date <= p_to)
      group by ds.section_key, ds.section_name, date_trunc(bucket, d.full_date)
    ) t
  );
end;
$fn$;

revoke execute on function public.dw_section_trend(uuid[], date, date, text)
  from public, anon, authenticated;
grant execute on function public.dw_section_trend(uuid[], date, date, text) to service_role;
