-- =================================================================
-- 026: Adaptive assessments — attempt limits, criteria-owned questions,
--      and a per-attempt served question set
--
-- Three gaps this closes:
--
--   1. Retakes were unlimited. `max_attempts` on the assessment is the
--      default; the same column on an assignment overrides it for one
--      student. null at both levels = unlimited, which is today's behaviour.
--
--   2. Criteria matched questions *indirectly*, through a shared
--      competency_id. Any question tagged with two competencies counted
--      toward every criteria sharing them, so criteria double-counted each
--      other's questions — in the worst live case three criteria on one
--      assessment all scored against all ten questions and their 40/30/30
--      weights meant nothing. `questions.criteria_id` makes the ownership
--      direct and exclusive. `question_competencies` stays as-is: it is the
--      ML recommender's TF-IDF signal, and is no longer used for scoring.
--
--   3. Every attempt served the whole question bank in `position` order, so
--      there was no fixed paper size, no randomisation, and no held-back
--      pool for a later attempt to draw on. `total_questions` fixes the
--      paper size, `min_questions` guarantees each criteria is represented,
--      and `attempt_questions` records what was actually served.
--
-- Schema only. Assigning the existing questions to criteria, and repairing
-- the attempt/competency scores computed under the old matching, is done by
-- scripts/backfill-assessment-criteria.ts so the guesses it has to make are
-- reviewable with --dry before anything is written.
-- =================================================================

-- -----------------------------------------------------------------
-- Assessment-level configuration
-- -----------------------------------------------------------------
alter table public.assessments
  -- null = unlimited retakes (the behaviour before this migration)
  add column if not exists max_attempts int
    check (max_attempts is null or max_attempts > 0),
  -- how many questions one attempt serves; null = serve the whole bank
  add column if not exists total_questions int
    check (total_questions is null or total_questions > 0);

-- Per-student override. null = inherit the assessment's limit.
alter table public.assessment_assignments
  add column if not exists max_attempts int
    check (max_attempts is null or max_attempts > 0);

-- Floor on how many of this criteria's questions every attempt must include.
-- The allocator may exceed it; it may never go under.
alter table public.assessment_criteria
  add column if not exists min_questions int not null default 1
    check (min_questions >= 0);

-- -----------------------------------------------------------------
-- Questions belong to exactly one criteria
--
-- Nullable on purpose: the backfill leaves a question null when no criteria
-- claims it, and publish validation refuses to publish while any remain.
-- A null is a question that is never served, not one that is silently
-- dropped from a live quiz.
--
-- Note the FK cannot also prove the criteria belongs to the *same*
-- assessment (that needs a composite key, and the composite form of
-- ON DELETE SET NULL is Postgres 15+). The API layer validates it instead.
-- -----------------------------------------------------------------
alter table public.questions
  add column if not exists criteria_id uuid
    references public.assessment_criteria(id) on delete set null;

create index if not exists idx_questions_criteria
  on public.questions(assessment_id, criteria_id);

-- -----------------------------------------------------------------
-- The questions served for one attempt, in the order they were served
--
-- criteria_id is a snapshot: re-pointing a question at a different criteria
-- later must not silently rewrite how a past attempt was scored. Grading
-- reads this table, so the denominator is the served count rather than the
-- size of the bank.
-- -----------------------------------------------------------------
create table if not exists public.attempt_questions (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid not null references public.assessment_attempts(id) on delete cascade,
  question_id uuid not null references public.questions(id) on delete cascade,
  criteria_id uuid references public.assessment_criteria(id) on delete set null,
  position int not null,
  created_at timestamptz not null default now(),
  unique (attempt_id, question_id),
  unique (attempt_id, position)
);

-- (attempt_id, ...) lookups ride the unique indexes; these cover the FK
-- targets so deleting a question or criteria doesn't sequential-scan.
create index if not exists idx_attempt_questions_question
  on public.attempt_questions(question_id);
create index if not exists idx_attempt_questions_criteria
  on public.attempt_questions(criteria_id);

alter table public.attempt_questions enable row level security;

drop policy if exists "students read own attempt questions" on public.attempt_questions;
create policy "students read own attempt questions" on public.attempt_questions
  for select using (
    exists (
      select 1 from public.assessment_attempts aa
      where aa.id = attempt_questions.attempt_id
        and aa.student_id = auth.uid()
    )
  );

drop policy if exists "faculty and admin read attempt questions" on public.attempt_questions;
create policy "faculty and admin read attempt questions" on public.attempt_questions
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );
