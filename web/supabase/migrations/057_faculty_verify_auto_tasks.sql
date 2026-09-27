-- =================================================================
-- 057: Scenario tasks no longer complete themselves.
--
-- Two default tasks ("Assess Patient Vital Signs", "Document
-- Assessment") were checked off automatically when the student
-- recorded vitals or charted on the ward patient. Students no longer
-- chart on the ward (see 056), so nothing could ever tick them; they
-- are now rated by the instructor during RetDem like every other
-- skill.
--
-- The enum and column stay (024's check constraint still holds for
-- faculty tasks). Completions already recorded with completed_via =
-- 'system' are left as history.
-- =================================================================

update public.scenario_tasks
   set verification = 'faculty',
       system_trigger = null
 where verification = 'system';
