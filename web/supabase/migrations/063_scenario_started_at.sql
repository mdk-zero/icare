-- =================================================================
-- 063: A patient case's clock starts when the student starts it.
--
-- RetDem is graded live by the instructor, so the student never hands
-- anything in and nothing wrote time_taken: every run read 00:00.
-- started_at is stamped when the student confirms they are ready
-- (POST /api/student/scenarios/:id/start), and the finalize route
-- sets time_taken from it when the last task is graded. Null means
-- not started yet; existing rows keep whatever time_taken they had.
-- =================================================================

alter table public.scenario_assignments
  add column if not exists started_at timestamptz;
