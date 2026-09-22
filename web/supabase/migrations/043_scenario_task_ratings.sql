-- =================================================================
-- 043: Verbal ratings on scenario task check-offs.
--
-- Until now a task was either done (a completion row, full points) or
-- not (no row, zero). Faculty grading a return demonstration needs more
-- than that: a student can give a medication with poor technique, or
-- chart an assessment that is incomplete. Each completion now carries a
-- verbal rating that scales the task's points at finalize:
--
--   excellent 100% · very_good 90% · good 80% · fair 70%
--   needs_improvement 50% · not_performed 0%
--
-- (The percentages live in the app, web/app/lib/task-ratings.ts, not
-- here, so the scale can be re-weighted without DDL.)
--
-- A null rating keeps its old meaning — full credit — so completions
-- recorded before this migration, and system tasks the student's
-- charting checked off that faculty have not rated, score as before.
--
-- not_performed is stored as a row rather than by deleting one, so a
-- criterion the instructor rated "not performed" reads back as rated
-- instead of looking untouched. Readers that treat a row as "done"
-- must exclude it.
-- =================================================================

alter table public.scenario_task_completions
  add column if not exists rating text,
  add column if not exists remarks text,
  add column if not exists rated_by uuid references public.users(id) on delete set null;

do $$ begin
  alter table public.scenario_task_completions
    add constraint scenario_task_completions_rating_ck check (
      rating is null or rating in (
        'excellent', 'very_good', 'good', 'fair', 'needs_improvement', 'not_performed'
      )
    );
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.scenario_task_completions
    add constraint scenario_task_completions_remarks_ck check (
      remarks is null or char_length(remarks) <= 1000
    );
exception when duplicate_object then null; end $$;
