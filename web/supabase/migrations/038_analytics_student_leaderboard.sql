-- =================================================================
-- 038: Full student leaderboard for the faculty analytics page.
--
-- The dashboard card now shows only the top 5 of 036's `top_students` and
-- links to a page listing everyone. This is that list: the same ranking as
-- `top_students` (average submitted score, then attempt count), over the
-- same section/date scope, without the `limit 10` — so the card and the full
-- page never disagree about who is on top.
--
-- A separate function rather than a bigger `top_students`: the summary is
-- read on every dashboard load and by the AI narrative, neither of which
-- needs every student in scope.
-- =================================================================

create or replace function public.dw_student_leaderboard(
  p_section_ids uuid[] default null,   -- null = every section
  p_from date default null,            -- null = no lower bound
  p_to date default null               -- null = no upper bound
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
  scope uuid[];
begin
  if p_section_ids is not null then
    select coalesce(array_agg(student_key), '{}'::uuid[]) into scope
    from dw.dim_student where section_key = any(p_section_ids);
  end if;

  return (
    select coalesce(jsonb_agg(ranked.row order by ranked.ord), '[]'::jsonb)
    from (
      select
        jsonb_build_object(
          'student_key', ds.student_key,
          'name', ds.name,
          'section', ds.section_name,
          'average_score', round(avg(f.score), 1),
          'attempts', count(*)
        ) as row,
        -- 036's order, plus the student key so ties rank the same every read.
        row_number() over (
          order by avg(f.score) desc, count(*) desc, ds.student_key
        ) as ord
      from dw.fact_assessment_attempts f
      join dw.dim_student ds on ds.student_key = f.student_key
      where f.status = 'submitted'
        and (scope is null or f.student_key = any(scope))
        and (from_key is null or f.date_key >= from_key)
        and (to_key is null or f.date_key <= to_key)
      group by ds.student_key, ds.name, ds.section_name
    ) ranked
  );
end;
$fn$;

revoke execute on function public.dw_student_leaderboard(uuid[], date, date)
  from public, anon, authenticated;
grant execute on function public.dw_student_leaderboard(uuid[], date, date) to service_role;
