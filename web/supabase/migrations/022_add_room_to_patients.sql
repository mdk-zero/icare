-- =================================================================
-- 022: Link patients to a real room in the system
-- =================================================================
-- Patients previously stored location only as free-text room_number
-- (imported from MIMIC-IV). This adds a proper foreign key to the rooms
-- table. room_number is kept as a denormalized, human-readable label that
-- the API syncs from the linked room on every write, so EHR/Vitals/AI that
-- read room_number stay consistent without changes.

alter table public.patients
  add column if not exists room_id uuid references public.rooms(id) on delete set null;

create index if not exists idx_patients_room_id on public.patients(room_id);
