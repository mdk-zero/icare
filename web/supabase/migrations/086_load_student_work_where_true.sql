-- =================================================================
-- 086: The warehouse ETL runs again from the app.
--
-- 085's dw.load_student_work() emptied its table with a bare
-- `delete from dw.fact_student_work;`. Supabase loads pg-safeupdate on
-- connections that come through PostgREST, and it rejects any DELETE or
-- UPDATE with no WHERE clause, with "DELETE requires a WHERE clause". The
-- SQL editor doesn't load it, so applying 085 there worked, and its own
-- closing run_dw_etl() succeeded. Every run since, all of them through
-- rpc('run_dw_etl'), has failed.
--
-- run_dw_etl is one transaction, so the failure undid the whole load and
-- not only this table: the warehouse has held its 085 contents since then,
-- and the Analytics route, which treats a failed refresh as non-fatal,
-- kept serving them.
--
-- `where true` satisfies the check, which only asks whether a WHERE clause
-- exists. TRUNCATE would too, but its exclusive lock would hold up every
-- dashboard read until the load commits; this DELETE doesn't.
--
-- Any function reached through rpc() needs the same care.
-- =================================================================

create or replace function dw.load_student_work()
returns bigint
language plpgsql
security definer
set search_path = dw, public
as $fn$
declare
  n bigint;
begin
  delete from dw.fact_student_work where true;

  insert into dw.fact_student_work (work_key, student_key, campus_key, date_key, kind, item_key, score)
  select a.id, a.student_id, u.campus_id,
         to_char(coalesce(a.submitted_at, a.created_at), 'YYYYMMDD')::int,
         'quiz', a.assessment_id,
         case when a.status::text = 'submitted' then a.score end
  from public.assessment_attempts a
  join public.users u on u.id = a.student_id and u.role = 'student'
  union all
  select sa.id, sa.student_id, u.campus_id,
         to_char(coalesce(sa.submitted_at, sa.completed_at), 'YYYYMMDD')::int,
         case when s.kind = 'return_demo' then 'return_demo' else 'patient_case' end,
         sa.scenario_id,
         case when sa.status::text = 'completed' then sa.score end
  from public.scenario_assignments sa
  join public.scenarios s on s.id = sa.scenario_id
  join public.users u on u.id = sa.student_id and u.role = 'student'
  where sa.submitted_at is not null or sa.completed_at is not null
  union all
  select cs.id, cs.student_id, u.campus_id,
         to_char(coalesce(cs.submitted_at, cs.graded_at, cs.updated_at), 'YYYYMMDD')::int,
         'case_presentation', cs.presentation_id,
         case when cs.status::text = 'graded' then cs.score end
  from public.case_submissions cs
  join public.users u on u.id = cs.student_id and u.role = 'student'
  where cs.status::text in ('submitted', 'graded');
  get diagnostics n = row_count;

  update dw.etl_state
  set rows_loaded = rows_loaded || jsonb_build_object('fact_student_work', n)
  where id;

  return n;
end;
$fn$;

revoke execute on function dw.load_student_work() from public, anon, authenticated;

-- Catch the warehouse up now, so the dashboards change the moment this is applied.
select public.run_dw_etl();
