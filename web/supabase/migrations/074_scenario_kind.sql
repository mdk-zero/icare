-- =================================================================
-- 072: Return Demonstrations are scenarios with no patient.
--
-- A Patient Case is a scenario built on a patient: a brief, a room, and
-- tasks that are Taylor's skills whose sub-tasks are the skill's
-- checklist steps. A Return Demonstration is the same checklist with no
-- patient and no story: the instructor picks one or more skills, the
-- student demonstrates them, and each step is graded on the Patient Case
-- scale (Excellent / Satisfactory / Needs Practice / N/A).
--
-- So a Return Demonstration is a scenarios row of kind 'return_demo'
-- (patient_id null), and it reuses the tasks, steps, assignments,
-- grading, finalize and grade-edit tables as they are. Screens that show
-- Patient Cases read kind = 'patient_case' only.
--
-- Every existing row becomes a Patient Case through the default.
-- Additive; re-running is safe.
-- =================================================================

alter table public.scenarios
  add column if not exists kind text not null default 'patient_case';

alter table public.scenarios
  drop constraint if exists scenarios_kind_ck;

alter table public.scenarios
  add constraint scenarios_kind_ck check (kind in ('patient_case', 'return_demo'));

create index if not exists idx_scenarios_kind on public.scenarios (kind);
