-- =================================================================
-- 085: Analytics counts every kind of graded work, not only quizzes.
--
-- The warehouse (014) was built when quizzes were the only graded work,
-- so the dashboards' Average Student Performance, Active Students, Top
-- Students, leaderboard and score trend all read
-- dw.fact_assessment_attempts alone. Patient Cases, Return
-- Demonstrations and Case Presentations came later and never reached
-- the warehouse: a student who failed every Patient Case but passed the
-- quizzes topped the leaderboard, and one who only did Patient Cases
-- counted as inactive.
--
-- dw.fact_student_work holds one row per piece of work a student has
-- handed in, of every kind, with its grade once it has one:
--   quiz               every attempt; graded when submitted (a practice
--                      run, 083, or an expired attempt is activity only)
--   patient_case       a scenario assignment of kind patient_case,
--   return_demo        or return_demo (074), handed in or completed;
--                      graded once completed
--   case_presentation  a case submission handed in; graded once graded
-- Each is dated by when the student did the work (handed it in), so a
-- grade given a week later still lands in the week it was done.
--
-- Every score is the 0-100 percentage the app already stores. Averages
-- take every graded piece of work alike, as the course's automatic
-- grading split does (070), and every graded quiz try counts, as the
-- student-wide quiz average always has (083).
--
-- dw_analytics_summary and dw_student_leaderboard now read it:
--   cohort.average_score       every graded piece of work, all kinds
--   cohort.graded              how many (new)
--   cohort.by_kind             average, graded and students per kind (new)
--   cohort.active_students_30d anyone who handed in any work
--   cohort.submitted_attempts  submitted quiz attempts, as before
--   sections.active_students   anyone who handed in any work
--   weekly_trend               every graded piece of work; `attempts`
--                              is how many
--   top_students, leaderboard  ranked over every graded piece of work;
--                              `attempts` is how many, and `by_kind`
--                              (new) is the student's average per kind
-- Skill areas, clinical activity, room use and the risk distribution
-- are unchanged from 082.
--
-- The loader rebuilds the table on each run rather than upserting:
-- grades change (an approved grade edit, a reopened case), so a full
-- reload is the simplest way to never hold a stale one, and at these
-- volumes it costs little. It runs inside run_dw_etl's transaction, so
-- a dashboard never reads it half-loaded.
-- =================================================================

create table if not exists dw.fact_student_work (
  work_key uuid primary key,             -- attempt, scenario assignment or case submission id
  student_key uuid not null,
  campus_key uuid,
  date_key int not null,                 -- when the student handed it in
  kind text not null check (kind in ('quiz', 'patient_case', 'return_demo', 'case_presentation')),
  item_key uuid not null,                -- assessment, scenario or case presentation id
  score numeric(5,2)                     -- 0-100; null until graded
);

create index if not exists idx_fact_work_student on dw.fact_student_work(student_key);
create index if not exists idx_fact_work_date on dw.fact_student_work(date_key);

grant select on dw.fact_student_work to service_role;

-- -----------------------------------------------------------------
-- Loader
-- -----------------------------------------------------------------

create or replace function dw.load_student_work()
returns bigint
language plpgsql
security definer
set search_path = dw, public
as $fn$
declare
  n bigint;
begin
  delete from dw.fact_student_work;

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

-- Load, load the work, then prune (040). The work table needs no pruning:
-- it is rebuilt whole.
create or replace function public.run_dw_etl()
returns jsonb
language plpgsql
security definer
set search_path = dw, public
as $fn$
declare
  loaded jsonb;
begin
  loaded := dw.run_etl();
  loaded := loaded || jsonb_build_object('fact_student_work', dw.load_student_work());
  return loaded || jsonb_build_object('pruned', dw.prune_orphans());
end;
$fn$;

revoke execute on function public.run_dw_etl() from public, anon, authenticated;
grant execute on function public.run_dw_etl() to service_role;

-- -----------------------------------------------------------------
-- Summary
-- -----------------------------------------------------------------

create or replace function public.dw_analytics_summary(
  p_section_ids uuid[] default null,   -- null = every section
  p_from date default null,            -- null = no lower bound
  p_to date default null,              -- null = no upper bound
  p_bucket text default 'week',        -- trend granularity: day|week|month|year
  p_student_ids uuid[] default null    -- null = every student in the sections
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
  if p_student_ids is not null then
    scope := array(
      select k from unnest(coalesce(scope, p_student_ids)) k where k = any(p_student_ids)
    );
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
        left join dw.fact_student_work f on f.student_key = ds.student_key
          and (from_key is null or f.date_key >= from_key)
          and (to_key is null or f.date_key <= to_key)
        where ds.section_key is not null
          and (p_section_ids is null or ds.section_key = any(p_section_ids))
          and (p_student_ids is null or ds.student_key = any(p_student_ids))
        group by ds.section_key, ds.section_name
      ) s
    ),
    'cohort', (
      select jsonb_build_object(
        'total_students', (
          select count(*) from dw.dim_student ds
          where (p_section_ids is null or ds.section_key = any(p_section_ids))
            and (p_student_ids is null or ds.student_key = any(p_student_ids))
        ),
        'submitted_attempts', count(*) filter (where f.kind = 'quiz' and f.score is not null),
        'graded', count(f.score),
        'average_score', round(avg(f.score), 1),
        'active_students_30d', count(distinct f.student_key)
          filter (where f.date_key >= active_from and (to_key is null or f.date_key <= to_key)),
        'by_kind', (
          select coalesce(jsonb_object_agg(k.kind, jsonb_build_object(
            'average_score', k.average_score,
            'graded', k.graded,
            'students', k.students
          )), '{}'::jsonb)
          from (
            select w.kind, round(avg(w.score), 1) as average_score,
                   count(*) as graded, count(distinct w.student_key) as students
            from dw.fact_student_work w
            where w.score is not null
              and (scope is null or w.student_key = any(scope))
              and (from_key is null or w.date_key >= from_key)
              and (to_key is null or w.date_key <= to_key)
            group by w.kind
          ) k
        )
      )
      from dw.fact_student_work f
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
        from dw.fact_student_work f
        join dw.dim_date d on d.date_key = f.date_key
        where f.score is not null
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
          -- the live row's time breaks ties between runs on the same day
          left join public.performance_predictions pp on pp.id = p.prediction_key
          where (scope is null or p.student_key = any(scope))
            -- 082: only students with work, as the roster does
            -- (getStudentsWithWork in app/lib/faculty-dashboard.ts).
            and (
              exists (select 1 from public.scenario_assignments sa
                      where sa.student_id = p.student_key
                        and sa.status::text in ('in_progress', 'completed'))
              or exists (select 1 from public.assessment_assignments aa
                         where aa.student_id = p.student_key
                           and aa.status::text in ('in_progress', 'completed'))
              or exists (select 1 from public.assessment_attempts at
                         where at.student_id = p.student_key)
              or exists (select 1 from public.case_submissions cs
                         where cs.student_id = p.student_key
                           and cs.status::text in ('submitted', 'graded'))
            )
          order by p.student_key, p.date_key desc, pp.predicted_at desc nulls last
        ) latest
        group by risk
      ) dist
    ),
    -- Ranked over every graded piece of work, with each student's average
    -- per kind beside it.
    'top_students', (
      select coalesce(jsonb_agg(row order by ord), '[]'::jsonb)
      from (
        select jsonb_build_object(
          'student_key', ds.student_key,
          'name', ds.name,
          'section', ds.section_name,
          'average_score', round(sum(pk.total) / sum(pk.graded), 1),
          'attempts', sum(pk.graded),
          'by_kind', jsonb_object_agg(pk.kind, round(pk.total / pk.graded, 1))
        ) as row,
        row_number() over (
          order by sum(pk.total) / sum(pk.graded) desc, sum(pk.graded) desc, ds.student_key
        ) as ord
        from (
          select f.student_key, f.kind, sum(f.score) as total, count(*) as graded
          from dw.fact_student_work f
          where f.score is not null
            and (scope is null or f.student_key = any(scope))
            and (from_key is null or f.date_key >= from_key)
            and (to_key is null or f.date_key <= to_key)
          group by f.student_key, f.kind
        ) pk
        join dw.dim_student ds on ds.student_key = pk.student_key
        group by ds.student_key, ds.name, ds.section_name
        order by ord
        limit 10
      ) top
    ),
    -- Which model is issuing the risk labels above (036).
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

revoke execute on function public.dw_analytics_summary(uuid[], date, date, text, uuid[])
  from public, anon, authenticated;
grant execute on function public.dw_analytics_summary(uuid[], date, date, text, uuid[]) to service_role;

-- -----------------------------------------------------------------
-- Leaderboard: every student in scope, in top_students order
-- -----------------------------------------------------------------

create or replace function public.dw_student_leaderboard(
  p_section_ids uuid[] default null,   -- null = every section
  p_from date default null,            -- null = no lower bound
  p_to date default null,              -- null = no upper bound
  p_student_ids uuid[] default null    -- null = every student in the sections
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
  if p_student_ids is not null then
    scope := array(
      select k from unnest(coalesce(scope, p_student_ids)) k where k = any(p_student_ids)
    );
  end if;

  return (
    select coalesce(jsonb_agg(ranked.row order by ranked.ord), '[]'::jsonb)
    from (
      select
        jsonb_build_object(
          'student_key', ds.student_key,
          'name', ds.name,
          'section', ds.section_name,
          'average_score', round(sum(pk.total) / sum(pk.graded), 1),
          'attempts', sum(pk.graded),
          'by_kind', jsonb_object_agg(pk.kind, round(pk.total / pk.graded, 1))
        ) as row,
        row_number() over (
          order by sum(pk.total) / sum(pk.graded) desc, sum(pk.graded) desc, ds.student_key
        ) as ord
      from (
        select f.student_key, f.kind, sum(f.score) as total, count(*) as graded
        from dw.fact_student_work f
        where f.score is not null
          and (scope is null or f.student_key = any(scope))
          and (from_key is null or f.date_key >= from_key)
          and (to_key is null or f.date_key <= to_key)
        group by f.student_key, f.kind
      ) pk
      join dw.dim_student ds on ds.student_key = pk.student_key
      group by ds.student_key, ds.name, ds.section_name
    ) ranked
  );
end;
$fn$;

revoke execute on function public.dw_student_leaderboard(uuid[], date, date, uuid[])
  from public, anon, authenticated;
grant execute on function public.dw_student_leaderboard(uuid[], date, date, uuid[]) to service_role;

-- Fill it now, so the dashboards change the moment this is applied.
select public.run_dw_etl();
