-- Link scenarios to the MIMIC patient they are based on. Students may only
-- see / chart on patients that appear in one of their assigned scenarios,
-- so this column is what scopes the mobile EHR & vitals views.
alter table public.scenarios
  add column if not exists patient_id uuid references public.patients(id) on delete set null;

create index if not exists idx_scenarios_patient_id on public.scenarios(patient_id);
