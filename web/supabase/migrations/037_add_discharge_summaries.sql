-- =================================================================
-- 037: Discharge summaries and follow-up recommendations.
--
-- A discharge summary is a point-in-time record of one stay, not a
-- view over live data: the vitals, sheets and notes it reports on can
-- later be edited or deleted, and the summary must still say what was
-- true at discharge. So the digest is materialised here at check-out
-- rather than recomputed on read.
--
-- One row per stay, not per patient — 034 lets a patient be checked
-- back in, and each admission earns its own summary.
--
-- Follow-up recommendations are drafted separately from the factual
-- digest (see follow_up/ai_* below), so a slow or failed AI call can
-- never block or fail a check-out.
-- =================================================================

create table if not exists public.discharge_summaries (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.patients(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,

  -- The stay this summary closes, copied so it survives later edits.
  admitted_at   timestamptz,
  discharged_at timestamptz not null default now(),
  diagnosis     text not null default '',
  room_label    text not null default '',

  -- Factual digest computed at check-out: vitals extremes/averages, the
  -- flagged-reading tally, and TPR/IVF/note counts for the stay.
  vitals_digest jsonb not null default '{}'::jsonb,
  ehr_digest    jsonb not null default '{}'::jsonb,

  -- Drafted after the fact; empty until someone asks for it.
  follow_up        jsonb not null default '[]'::jsonb,
  ai_model         text,
  ai_generated_at  timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_discharge_summaries_patient
  on public.discharge_summaries(patient_id, discharged_at desc);

alter table public.discharge_summaries enable row level security;

-- Written only through the service-role API routes, which have already
-- established who is asking; faculty/admin may read.
drop policy if exists "faculty and admin can read discharge summaries" on public.discharge_summaries;
create policy "faculty and admin can read discharge summaries" on public.discharge_summaries
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop trigger if exists trg_discharge_summaries_updated_at on public.discharge_summaries;
create trigger trg_discharge_summaries_updated_at
  before update on public.discharge_summaries
  for each row execute function public.set_updated_at();

comment on table public.discharge_summaries is
  'One per completed stay, materialised at check-out. follow_up holds AI-drafted recommendations, drafted separately so the AI never blocks a discharge.';
