-- =================================================================
-- 027: Stop deleted attempts leaving competency scores behind
--
-- competency_scores.attempt_id is ON DELETE SET NULL, so deleting an attempt
-- kept its derived score with a null attempt_id. Those rows are invisible
-- junk that still counts: resolveCompetencies() reads every row for a
-- student, and the ML recommender builds its weakness profile from the same
-- table, so a score whose evidence no longer exists keeps steering both.
--
-- The obvious fix — switching the FK to ON DELETE CASCADE — is wrong. The
-- faculty competency route accepts an optional attempt_id, so a
-- faculty_validation row can also point at an attempt. Cascading would
-- delete a faculty member's own judgement because a student's attempt was
-- tidied up, and faculty judgement is the highest-authority signal
-- resolveCompetencies() has. Only machine-derived rows should follow their
-- attempt to the grave; a faculty score outlives the attempt that prompted
-- it and simply loses the back-reference.
--
-- That distinction is on source, which a foreign key cannot express, so it
-- is a BEFORE DELETE trigger instead. Being in the database rather than in a
-- route means it also covers deletes from the Supabase dashboard and from
-- the backfill scripts.
-- =================================================================

create or replace function public.delete_derived_competency_scores()
returns trigger
language plpgsql
as $$
begin
  -- Only rows this attempt produced. Faculty validations that merely
  -- reference it keep their row and fall back to the FK's SET NULL.
  delete from public.competency_scores
  where attempt_id = old.id
    and source = 'assessment';
  return old;
end;
$$;

-- BEFORE, so it runs while attempt_id still points at the row being deleted.
drop trigger if exists trg_attempt_delete_derived_scores on public.assessment_attempts;

create trigger trg_attempt_delete_derived_scores
  before delete on public.assessment_attempts
  for each row execute function public.delete_derived_competency_scores();

-- -----------------------------------------------------------------
-- Clear anything the old behaviour already stranded.
--
-- deriveCompetencyScoresForAttempt() always sets attempt_id, and it is the
-- only writer of source='assessment' rows, so an assessment-derived row
-- without one can only be an attempt that has since been deleted.
-- -----------------------------------------------------------------
delete from public.competency_scores
where source = 'assessment'
  and attempt_id is null;
