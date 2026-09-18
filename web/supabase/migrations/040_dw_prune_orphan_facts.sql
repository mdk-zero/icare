-- =================================================================
-- 040: The warehouse ETL forgets what the source forgets.
--
-- dw.run_etl (014) only ever upserts. A fact whose source row is deleted
-- stays in the warehouse for good, and the dashboards keep counting it: a
-- quiz attempt deleted in the app still moves its section's average on the
-- trend chart, a deleted student's competency scores still rank. Re-running
-- seed-student-history.ts, which rebuilds attempts under new ids, left every
-- earlier run's attempts behind as ghosts dated to when they were taken.
--
-- dw.prune_orphans() deletes each fact whose source row no longer exists,
-- and run_dw_etl() now calls it after every load. A separate function rather
-- than an edit to dw.run_etl, so this does not restate that function's body —
-- the live copy is the one that runs, whatever the migration files say.
--
-- Dimensions are left alone: they only matter through the facts that join to
-- them, and a fact never outlives its source now.
-- =================================================================

create or replace function dw.prune_orphans()
returns jsonb
language plpgsql
security definer
set search_path = dw, public
as $fn$
declare
  counts jsonb := '{}'::jsonb;
  n int;
begin
  delete from dw.fact_assessment_attempts f
  where not exists (select 1 from public.assessment_attempts a where a.id = f.attempt_key);
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('fact_assessment_attempts', n);

  delete from dw.fact_vital_readings f
  where not exists (select 1 from public.vital_sign_readings v where v.id = f.reading_key);
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('fact_vital_readings', n);

  -- One fact table fed by three sources; a task survives if any still has it.
  delete from dw.fact_clinical_tasks f
  where not exists (select 1 from public.tpr_records t where t.id = f.task_key)
    and not exists (select 1 from public.ivf_records i where i.id = f.task_key)
    and not exists (select 1 from public.progress_notes p where p.id = f.task_key);
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('fact_clinical_tasks', n);

  delete from dw.fact_competency_scores f
  where not exists (select 1 from public.competency_scores c where c.id = f.score_key);
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('fact_competency_scores', n);

  delete from dw.fact_predictions f
  where not exists (select 1 from public.performance_predictions p where p.id = f.prediction_key);
  get diagnostics n = row_count;
  counts := counts || jsonb_build_object('fact_predictions', n);

  return counts;
end;
$fn$;

revoke execute on function dw.prune_orphans() from public, anon, authenticated;

-- Load, then prune. The result gains a `pruned` key with what was removed.
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
  return loaded || jsonb_build_object('pruned', dw.prune_orphans());
end;
$fn$;

revoke execute on function public.run_dw_etl() from public, anon, authenticated;
grant execute on function public.run_dw_etl() to service_role;

-- Clear what has already built up.
select dw.prune_orphans();
