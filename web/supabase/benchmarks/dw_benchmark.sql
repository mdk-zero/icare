-- =================================================================
-- Data Warehouse query benchmark harness (PLAN Phase 4.4; feeds the
-- manuscript's "Data Warehouse Query Performance" evaluation, Table III)
--
-- Run against the Supabase database (or a restored copy):
--   psql "$DATABASE_URL" -f supabase/benchmarks/dw_benchmark.sql > dw_benchmark_results.txt
--
-- Each query is a representative analytical workload; record the
-- "Execution Time" lines under single-user and JMeter concurrent load
-- (Phase 8.6) for the DW Performance Report.
-- =================================================================

\timing on

-- Q1: Cohort weekly score trend (dashboard headline chart)
explain (analyze, buffers)
select date_trunc('week', d.full_date) as week, round(avg(f.score), 1), count(*)
from dw.fact_assessment_attempts f
join dw.dim_date d on d.date_key = f.date_key
where f.status = 'submitted'
group by 1 order by 1;

-- Q2: Competency pass rates across the cohort (pass = score >= 75)
explain (analyze, buffers)
select c.name,
       count(*) as ratings,
       round(avg(f.score), 1) as avg_score,
       round(100.0 * count(*) filter (where f.score >= 75) / count(*), 1) as pass_rate_pct
from dw.fact_competency_scores f
join dw.dim_competency c on c.competency_key = f.competency_key
group by c.name order by pass_rate_pct;

-- Q3: Per-student performance rollup (advising view)
explain (analyze, buffers)
select s.name,
       count(f.attempt_key) filter (where f.status = 'submitted') as attempts,
       round(avg(f.score) filter (where f.status = 'submitted'), 1) as avg_score,
       max(f.date_key) as last_activity
from dw.dim_student s
left join dw.fact_assessment_attempts f on f.student_key = s.student_key
group by s.student_key, s.name
order by avg_score nulls last;

-- Q4: Vitals anomaly rate by month per campus
explain (analyze, buffers)
select c.code, d.year, d.month,
       count(*) as readings,
       count(*) filter (where f.is_anomaly) as anomalies,
       round(100.0 * count(*) filter (where f.is_anomaly) / count(*), 1) as anomaly_pct
from dw.fact_vital_readings f
join dw.dim_date d on d.date_key = f.date_key
left join dw.dim_campus c on c.campus_key = f.campus_key
group by c.code, d.year, d.month
order by d.year, d.month;

-- Q5: Latest at-risk prediction per student (early-warning list)
explain (analyze, buffers)
select s.name, latest.risk, latest.probability
from (
  select distinct on (student_key) student_key, risk, probability
  from dw.fact_predictions
  order by student_key, date_key desc
) latest
join dw.dim_student s on s.student_key = latest.student_key
where latest.risk = 'at_risk'
order by latest.probability desc;

-- Q6: Full dashboard payload (what /api/analytics/summary executes)
explain (analyze, buffers)
select public.dw_analytics_summary();
