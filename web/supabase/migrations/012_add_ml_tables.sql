-- =================================================================
-- 012: ML artifacts (ERD Performance & ML cluster; Objectives 2.1, 2.2)
--
-- ml_models .............. model registry (RF, LogReg, recommender),
--                          versioned, with evaluation metrics recorded
--                          for the manuscript's Ch. IV evidence tables
-- performance_predictions  at-risk classifications per student, keeping
--                          the producing model version for auditability
-- learning_recommendations content-based filtering outputs per student
-- competency_scores ....... faculty-validated competency ratings (also
--                          derived from attempts) — the ML label source
-- =================================================================

do $$ begin
  create type ml_model_kind as enum ('random_forest', 'logistic_regression', 'recommender');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ml_model_status as enum ('staging', 'active', 'retired');
exception when duplicate_object then null; end $$;

create table if not exists public.ml_models (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind ml_model_kind not null,
  version text not null,
  status ml_model_status not null default 'staging',
  metrics jsonb not null default '{}'::jsonb,   -- precision/recall/F1, hit@k
  artifact_url text,                            -- storage path of the model file
  is_baseline boolean not null default false,   -- pre-trained public-dataset model
  trained_at timestamptz,
  created_at timestamptz not null default now(),
  unique (kind, version)
);

alter table public.ml_models enable row level security;

drop policy if exists "faculty and admin read ml models" on public.ml_models;

create policy "faculty and admin read ml models" on public.ml_models
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

-- -----------------------------------------------------------------

do $$ begin
  create type risk_level as enum ('safe', 'at_risk');
exception when duplicate_object then null; end $$;

create table if not exists public.performance_predictions (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  model_id uuid not null references public.ml_models(id) on delete cascade,
  risk risk_level not null,
  probability numeric(5,4) check (probability >= 0 and probability <= 1),
  features jsonb not null default '{}'::jsonb,      -- input feature snapshot
  explanations jsonb not null default '[]'::jsonb,  -- top contributing features
  predicted_at timestamptz not null default now()
);

create index if not exists idx_performance_predictions_student
  on public.performance_predictions(student_id, predicted_at desc);
create index if not exists idx_performance_predictions_risk
  on public.performance_predictions(risk, predicted_at desc);

alter table public.performance_predictions enable row level security;

drop policy if exists "faculty and admin read predictions" on public.performance_predictions;

create policy "faculty and admin read predictions" on public.performance_predictions
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

-- -----------------------------------------------------------------

create table if not exists public.learning_recommendations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  model_id uuid references public.ml_models(id) on delete set null,
  assessment_id uuid references public.assessments(id) on delete cascade,
  competency_id uuid references public.competency_areas(id) on delete set null,
  rank int not null default 1,
  reason text not null default '',       -- human-readable "why recommended"
  created_at timestamptz not null default now(),
  dismissed_at timestamptz,
  completed_at timestamptz
);

create index if not exists idx_learning_recommendations_student
  on public.learning_recommendations(student_id, created_at desc);

alter table public.learning_recommendations enable row level security;

drop policy if exists "students read own recommendations" on public.learning_recommendations;

create policy "students read own recommendations" on public.learning_recommendations
  for select using (auth.uid() = student_id);

drop policy if exists "faculty and admin read recommendations" on public.learning_recommendations;

create policy "faculty and admin read recommendations" on public.learning_recommendations
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

-- -----------------------------------------------------------------

do $$ begin
  create type competency_score_source as enum ('faculty_validation', 'assessment', 'simulation');
exception when duplicate_object then null; end $$;

create table if not exists public.competency_scores (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  competency_id uuid not null references public.competency_areas(id) on delete cascade,
  faculty_id uuid references public.users(id) on delete set null,
  source competency_score_source not null default 'faculty_validation',
  score numeric(5,2) not null check (score >= 0 and score <= 100),
  attempt_id uuid references public.assessment_attempts(id) on delete set null,
  remarks text,
  created_at timestamptz not null default now()
);

create index if not exists idx_competency_scores_student
  on public.competency_scores(student_id, created_at desc);
create index if not exists idx_competency_scores_competency
  on public.competency_scores(competency_id);

alter table public.competency_scores enable row level security;

drop policy if exists "students read own competency scores" on public.competency_scores;

create policy "students read own competency scores" on public.competency_scores
  for select using (auth.uid() = student_id);

drop policy if exists "faculty and admin manage competency scores" on public.competency_scores;

create policy "faculty and admin manage competency scores" on public.competency_scores
  for all using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );
