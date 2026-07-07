-- =================================================================
-- Patients table for MIMIC-IV demo (and eventually full MIMIC-IV) data
-- =================================================================

create table if not exists public.patients (
  id uuid primary key default gen_random_uuid(),
  subject_id bigint not null,
  hadm_id bigint,
  name text not null,
  age int,
  gender text,
  room_number text,
  diagnosis text,
  admission_date timestamptz,
  vital_signs jsonb not null default '{}'::jsonb,
  labs jsonb not null default '{}'::jsonb,
  mimic_id text not null,
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes for common lookups
create index if not exists idx_patients_subject_id on public.patients(subject_id);
create index if not exists idx_patients_hadm_id on public.patients(hadm_id);
create index if not exists idx_patients_mimic_id on public.patients(mimic_id);
create index if not exists idx_patients_created_by on public.patients(created_by);

-- Unique constraint so the seed script can safely upsert by subject_id/hadm_id
alter table public.patients
  drop constraint if exists uq_patients_subject_hadm;
alter table public.patients
  add constraint uq_patients_subject_hadm unique (subject_id, hadm_id);

-- Row-level security: only server/service role touches this table directly.
-- The Next.js API routes use the service role key, which bypasses RLS.
alter table public.patients enable row level security;

-- Admins/faculty can read patient rows; students can read as well.
drop policy if exists "faculty and students can read patients" on public.patients;
drop policy if exists "faculty and students can read patients" on public.patients;
create policy "faculty and students can read patients" on public.patients
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('student', 'faculty', 'admin')
    )
  );

-- Trigger to auto-update updated_at
-- (Supabase projects often already have the moddatetime extension enabled,
-- but we keep the trigger simple and self-contained here.)
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_patients_updated_at on public.patients;
create trigger trg_patients_updated_at
  before update on public.patients
  for each row execute function public.set_updated_at();
