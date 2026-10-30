-- =================================================================
-- 084: Bayesian Knowledge Tracing parameters.
--
-- The ML service fits the four BKT parameters per Taylor's skill from
-- every student's quiz answers, in order (graded attempts and practice
-- runs alike):
--   p_init   P(L0)  the student already knows the skill
--   p_learn  P(T)   they learn it after an answer
--   p_guess  P(G)   they answer right without knowing it
--   p_slip   P(S)   they answer wrong despite knowing it
-- A skill with too few answers to fit takes its chapter's pooled fit,
-- or the defaults ('source' says which); one with no answers at all has
-- no row, and readers use the defaults.
--
-- The adaptive quiz review reads these to estimate each student's
-- mastery of each skill when it deals a retake or practice run, and
-- gives the most questions to the least-mastered skills.
--
-- Until this is applied the review uses the defaults for every skill,
-- and the ML service skips the write.
-- =================================================================

alter type public.ml_model_kind add value if not exists 'knowledge_tracing';

create table if not exists public.bkt_parameters (
  skill_id text primary key references public.taylor_skills(id) on delete cascade,
  p_init numeric not null check (p_init >= 0 and p_init <= 1),
  p_learn numeric not null check (p_learn >= 0 and p_learn <= 1),
  p_guess numeric not null check (p_guess >= 0 and p_guess <= 1),
  p_slip numeric not null check (p_slip >= 0 and p_slip <= 1),
  source text not null check (source in ('fitted', 'chapter', 'default')),
  answers integer not null default 0 check (answers >= 0),
  students integer not null default 0 check (students >= 0),
  log_likelihood numeric,
  model_id uuid references public.ml_models(id) on delete set null,
  fitted_at timestamptz not null default now()
);

-- Server-side only, like the other ML tables: the service role reads and
-- writes it; no client ever does.
alter table public.bkt_parameters enable row level security;
