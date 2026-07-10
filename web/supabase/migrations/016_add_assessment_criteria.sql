-- Assessment Criteria for weighted competency scoring
-- Each assessment can define weighted criteria linked to competency areas.
-- The weights across all criteria for one assessment should sum to 100.

create table if not exists public.assessment_criteria (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  name text not null,
  weight numeric(5,2) not null check (weight > 0),
  competency_id uuid not null references public.competency_areas(id) on delete cascade,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (assessment_id, sort_order)
);

-- Enable RLS (default off for service-role)
alter table public.assessment_criteria enable row level security;

-- computed criteria breakdown stored per attempt
create table if not exists public.attempt_criteria_scores (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  criteria_id uuid not null references public.assessment_criteria(id) on delete cascade,
  competency_id uuid not null references public.competency_areas(id) on delete cascade,
  criteria_name text not null,
  weight numeric(5,2) not null,
  correct int not null default 0,
  total int not null default 0,
  score numeric(5,2) not null default 0,
  weighted_score numeric(5,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (attempt_id, criteria_id)
);
