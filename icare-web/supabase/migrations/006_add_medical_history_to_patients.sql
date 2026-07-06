alter table public.patients
  add column if not exists medical_history text;
