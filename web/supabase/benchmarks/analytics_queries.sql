-- =================================================================
-- The five analytics queries of the manuscript's analytics-query table,
-- timed with EXPLAIN ANALYZE inside the database (no network).
--
--   psql "$DATABASE_URL" -f supabase/benchmarks/analytics_queries.sql \
--     | grep -E '^(Q[0-9]|Execution Time)'
--
-- Each query runs three times; report the average "Execution Time". Run it
-- once with the system idle and once while a JMeter load step is running.
-- Read-only: every statement is a SELECT. dw_benchmark.sql is the older
-- harness, from before the warehouse read fact_student_work.
-- =================================================================

\pset pager off

-- Q1: Cohort-level performance summary: the whole Analytics dashboard in one
-- call, as /api/analytics/summary makes it, for the last 30 days.
\echo Q1 cohort summary
explain (analyze) select public.dw_analytics_summary(null, current_date - 30, current_date, 'week', null);
\echo Q1 cohort summary
explain (analyze) select public.dw_analytics_summary(null, current_date - 30, current_date, 'week', null);
\echo Q1 cohort summary
explain (analyze) select public.dw_analytics_summary(null, current_date - 30, current_date, 'week', null);

-- Q2: At-risk student identification report: each student's latest
-- prediction, the ones flagged at risk, most likely first.
\echo Q2 at-risk report
explain (analyze)
select s.name, latest.risk, latest.probability
from (
  select distinct on (student_key) student_key, risk, probability
  from dw.fact_predictions
  order by student_key, date_key desc, prediction_key desc
) latest
join dw.dim_student s on s.student_key = latest.student_key
where latest.risk = 'at_risk'
order by latest.probability desc;
\echo Q2 at-risk report
explain (analyze)
select s.name, latest.risk, latest.probability
from (
  select distinct on (student_key) student_key, risk, probability
  from dw.fact_predictions
  order by student_key, date_key desc, prediction_key desc
) latest
join dw.dim_student s on s.student_key = latest.student_key
where latest.risk = 'at_risk'
order by latest.probability desc;
\echo Q2 at-risk report
explain (analyze)
select s.name, latest.risk, latest.probability
from (
  select distinct on (student_key) student_key, risk, probability
  from dw.fact_predictions
  order by student_key, date_key desc, prediction_key desc
) latest
join dw.dim_student s on s.student_key = latest.student_key
where latest.risk = 'at_risk'
order by latest.probability desc;

-- Q3: Individual skill progress tracking: one student's scores per skill area
-- over time (the student with the most scored work).
\echo Q3 skill progress
explain (analyze)
select c.name, d.full_date, f.score
from dw.fact_competency_scores f
join dw.dim_competency c on c.competency_key = f.competency_key
join dw.dim_date d on d.date_key = f.date_key
where f.student_key = (
  select student_key from dw.fact_competency_scores group by student_key order by count(*) desc limit 1
)
order by c.name, d.full_date;
\echo Q3 skill progress
explain (analyze)
select c.name, d.full_date, f.score
from dw.fact_competency_scores f
join dw.dim_competency c on c.competency_key = f.competency_key
join dw.dim_date d on d.date_key = f.date_key
where f.student_key = (
  select student_key from dw.fact_competency_scores group by student_key order by count(*) desc limit 1
)
order by c.name, d.full_date;
\echo Q3 skill progress
explain (analyze)
select c.name, d.full_date, f.score
from dw.fact_competency_scores f
join dw.dim_competency c on c.competency_key = f.competency_key
join dw.dim_date d on d.date_key = f.date_key
where f.student_key = (
  select student_key from dw.fact_competency_scores group by student_key order by count(*) desc limit 1
)
order by c.name, d.full_date;

-- Q4: Performance per skill (chapter): average score and pass rate
-- (score >= 75) per skill area across the cohort.
\echo Q4 per chapter
explain (analyze)
select c.name, count(*) as ratings, round(avg(f.score), 1) as avg_score,
       round(100.0 * count(*) filter (where f.score >= 75) / count(*), 1) as pass_rate_pct
from dw.fact_competency_scores f
join dw.dim_competency c on c.competency_key = f.competency_key
group by c.name order by pass_rate_pct;
\echo Q4 per chapter
explain (analyze)
select c.name, count(*) as ratings, round(avg(f.score), 1) as avg_score,
       round(100.0 * count(*) filter (where f.score >= 75) / count(*), 1) as pass_rate_pct
from dw.fact_competency_scores f
join dw.dim_competency c on c.competency_key = f.competency_key
group by c.name order by pass_rate_pct;
\echo Q4 per chapter
explain (analyze)
select c.name, count(*) as ratings, round(avg(f.score), 1) as avg_score,
       round(100.0 * count(*) filter (where f.score >= 75) / count(*), 1) as pass_rate_pct
from dw.fact_competency_scores f
join dw.dim_competency c on c.competency_key = f.competency_key
group by c.name order by pass_rate_pct;

-- Q5: Classroom performance over time: the per-section weekly trend the
-- dashboard charts, for the last 30 days.
\echo Q5 classroom trend
explain (analyze) select public.dw_section_trend(null, current_date - 30, current_date, 'week', null);
\echo Q5 classroom trend
explain (analyze) select public.dw_section_trend(null, current_date - 30, current_date, 'week', null);
\echo Q5 classroom trend
explain (analyze) select public.dw_section_trend(null, current_date - 30, current_date, 'week', null);
