-- =================================================================
-- 098: Rooms are where an activity happens; activities carry their own
-- patient and a time limit.
--
-- Wards are rooms only now. A patient case no longer points at a patient in
-- a room: the instructor writes the patient into the case (patient_case), and
-- each student's assignment names the room they perform it in. A Return
-- Demonstration gets a room the same way. Both can have a time limit; the
-- student sees it count down once they start, and finishing past it makes the
-- try count for less in skill mastery.
--
-- Nothing is deleted. The patients and their records stay, and the cases
-- made on a patient get that patient copied into the case and their room
-- copied onto each assignment.
-- =================================================================

alter table public.scenarios
  add column if not exists time_limit_minutes integer
  check (time_limit_minutes is null or (time_limit_minutes between 1 and 240));

alter table public.scenario_assignments
  add column if not exists room_id uuid references public.rooms(id) on delete set null;

create index if not exists idx_scenario_assignments_room on public.scenario_assignments(room_id);

-- The patient each existing case was built on, written into the case, unless
-- the case already has a patient of its own.
update public.scenarios s
set patient_case = coalesce(s.patient_case, '{}'::jsonb)
  || jsonb_build_object(
       'patient', jsonb_build_object('name', p.name, 'age', p.age, 'sex', p.gender),
       'diagnosis', coalesce(nullif(s.patient_case ->> 'diagnosis', ''), p.diagnosis, ''),
       'medical_history', coalesce(nullif(s.patient_case ->> 'medical_history', ''), p.medical_history, ''),
       'vitals', coalesce(nullif(s.patient_case -> 'vitals', '{}'::jsonb), p.vital_signs, '{}'::jsonb)
     )
from public.patients p
where s.patient_id = p.id
  and (s.patient_case is null or not (s.patient_case ? 'patient'));

-- And the room that patient was in, on every assignment of the case that has no room yet.
update public.scenario_assignments a
set room_id = p.room_id
from public.scenarios s
join public.patients p on p.id = s.patient_id
where a.scenario_id = s.id
  and a.room_id is null
  and p.room_id is not null;
