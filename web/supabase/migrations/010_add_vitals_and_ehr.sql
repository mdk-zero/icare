-- =================================================================
-- 010: Vital signs monitoring + simulated EHR documentation
--      (DFD Process 4.0; ERD Clinical cluster: TPR/IVF records, Notes)
--
-- vital_sign_readings.is_anomaly / anomaly_reasons are set SERVER-SIDE
-- by the rule-based anomaly detector (manuscript scope: rule-based
-- clinical thresholds, not ML). Clients never write these fields.
-- =================================================================

create table if not exists public.vital_sign_readings (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  recorded_by uuid not null references public.users(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  heart_rate int check (heart_rate is null or heart_rate between 0 and 400),
  bp_systolic int check (bp_systolic is null or bp_systolic between 0 and 400),
  bp_diastolic int check (bp_diastolic is null or bp_diastolic between 0 and 300),
  temperature_c numeric(4,1) check (temperature_c is null or temperature_c between 20 and 46),
  respiratory_rate int check (respiratory_rate is null or respiratory_rate between 0 and 120),
  oxygen_saturation int check (oxygen_saturation is null or oxygen_saturation between 0 and 100),
  pain_score int check (pain_score is null or pain_score between 0 and 10),
  notes text,
  is_anomaly boolean not null default false,
  anomaly_reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_vital_readings_patient
  on public.vital_sign_readings(patient_id, recorded_at desc);
create index if not exists idx_vital_readings_recorded_by
  on public.vital_sign_readings(recorded_by);
create index if not exists idx_vital_readings_anomaly
  on public.vital_sign_readings(is_anomaly) where is_anomaly;

alter table public.vital_sign_readings enable row level security;

drop policy if exists "students read own vital readings" on public.vital_sign_readings;

create policy "students read own vital readings" on public.vital_sign_readings
  for select using (auth.uid() = recorded_by);

drop policy if exists "faculty and admin read vital readings" on public.vital_sign_readings;

create policy "faculty and admin read vital readings" on public.vital_sign_readings
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

-- -----------------------------------------------------------------
-- TPR sheet (Temperature, Pulse, Respiration) — per-shift charting
-- -----------------------------------------------------------------

create table if not exists public.tpr_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  recorded_by uuid not null references public.users(id) on delete cascade,
  recorded_at timestamptz not null default now(),
  shift text,                                   -- 'AM' | 'PM' | 'Night'
  temperature_c numeric(4,1),
  pulse int,
  respiration int,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tpr_records_patient
  on public.tpr_records(patient_id, recorded_at desc);

alter table public.tpr_records enable row level security;

drop policy if exists "students read own tpr records" on public.tpr_records;

create policy "students read own tpr records" on public.tpr_records
  for select using (auth.uid() = recorded_by);

drop policy if exists "faculty and admin read tpr records" on public.tpr_records;

create policy "faculty and admin read tpr records" on public.tpr_records
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop trigger if exists trg_tpr_records_updated_at on public.tpr_records;
create trigger trg_tpr_records_updated_at
  before update on public.tpr_records
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------
-- IVF sheet (intravenous fluids)
-- -----------------------------------------------------------------

do $$ begin
  create type ivf_status as enum ('ongoing', 'completed', 'discontinued');
exception when duplicate_object then null; end $$;

create table if not exists public.ivf_records (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  recorded_by uuid not null references public.users(id) on delete cascade,
  solution text not null,                       -- e.g. 'PNSS 1L'
  volume_ml int check (volume_ml is null or volume_ml > 0),
  rate_ml_hr numeric(6,1) check (rate_ml_hr is null or rate_ml_hr > 0),
  site text,                                    -- e.g. 'Left metacarpal vein'
  status ivf_status not null default 'ongoing',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  remarks text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ivf_records_patient
  on public.ivf_records(patient_id, started_at desc);

alter table public.ivf_records enable row level security;

drop policy if exists "students read own ivf records" on public.ivf_records;

create policy "students read own ivf records" on public.ivf_records
  for select using (auth.uid() = recorded_by);

drop policy if exists "faculty and admin read ivf records" on public.ivf_records;

create policy "faculty and admin read ivf records" on public.ivf_records
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop trigger if exists trg_ivf_records_updated_at on public.ivf_records;
create trigger trg_ivf_records_updated_at
  before update on public.ivf_records
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------
-- Progress notes (free-text or structured FDAR via `structured`)
-- -----------------------------------------------------------------

create table if not exists public.progress_notes (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete cascade,
  content text not null,
  structured jsonb not null default '{}'::jsonb, -- optional FDAR fields
  reviewed_by uuid references public.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_progress_notes_patient
  on public.progress_notes(patient_id, created_at desc);
create index if not exists idx_progress_notes_author
  on public.progress_notes(author_id);

alter table public.progress_notes enable row level security;

drop policy if exists "students read own progress notes" on public.progress_notes;

create policy "students read own progress notes" on public.progress_notes
  for select using (auth.uid() = author_id);

drop policy if exists "faculty and admin read progress notes" on public.progress_notes;

create policy "faculty and admin read progress notes" on public.progress_notes
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop trigger if exists trg_progress_notes_updated_at on public.progress_notes;
create trigger trg_progress_notes_updated_at
  before update on public.progress_notes
  for each row execute function public.set_updated_at();
