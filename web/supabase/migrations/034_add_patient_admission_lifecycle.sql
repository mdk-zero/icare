-- =================================================================
-- 034: Patient admission lifecycle — check-in / check-out.
--
-- Every patient row has been implicitly "in the ward" since 004:
-- admission_date says when they arrived and nothing could say they
-- left. Check-out needs a real status so discharge can free the bed
-- (room capacity counts admitted patients only from now on) and so
-- the upcoming discharge summary has a moment to anchor to.
--
-- Existing rows default to 'admitted': today's whole roster is an
-- active census, which is exactly what it has been treated as.
-- =================================================================

do $$ begin
  create type patient_status as enum ('admitted', 'discharged');
exception when duplicate_object then null; end $$;

alter table public.patients
  add column if not exists status patient_status not null default 'admitted';

alter table public.patients
  add column if not exists discharged_at timestamptz;

alter table public.patients
  add column if not exists discharged_by uuid references public.users(id) on delete set null;

create index if not exists idx_patients_status on public.patients(status);

comment on column public.patients.status is
  'Admission lifecycle. Check-out sets discharged and clears room_id/room_number (freeing the bed); check-in re-admits with a fresh admission_date.';
comment on column public.patients.discharged_at is
  'Set by check-out, cleared by re-admission. Null while admitted.';
comment on column public.patients.discharged_by is
  'The faculty/admin who performed the check-out.';
