-- =================================================================
-- 081: No attendance.
--
-- Shifts were retired on 2026-10-08, and attendance then came from each
-- activity's deadline (068). Attendance is now gone from the app
-- altogether, so what stored it goes too:
--
--   * "Activities attended" checklist items (course_requirements with
--     activity_type 'shift'). Their ticks and scores go with them (on
--     delete cascade). Since 070 a course's checklist is its activities,
--     so these items were no longer read.
--   * activity_excuses (068): excused absences.
--   * shifts and shift_assignments (029, 064) and their enum types: the
--     shift rosters and sign-in attendance, kept as history since
--     2026-10-08. Dropping them deletes that history for good, so back
--     the two tables up first if it is still wanted.
--
-- Deadlines stay: late and overdue work is still measured against them.
-- course_requirements_shape_ck still names 'shift' in one clause; with
-- the narrower activity_type check below that clause can never apply,
-- so the constraint is left as it is.
-- =================================================================

delete from public.course_requirements where activity_type = 'shift';

alter table public.course_requirements
  drop constraint if exists course_requirements_activity_type_check;
alter table public.course_requirements
  add constraint course_requirements_activity_type_check
  check (activity_type in ('scenario', 'assessment', 'case_presentation'));

drop table if exists public.activity_excuses;

-- Their policies, triggers and indexes go with them.
drop table if exists public.shift_assignments;
drop table if exists public.shifts;

drop type if exists public.shift_attendance_status;
drop type if exists public.shift_status;
drop type if exists public.shift_type;
