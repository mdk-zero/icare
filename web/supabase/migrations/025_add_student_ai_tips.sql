-- =================================================================
-- 025: Cached AI study tips per student
--
-- The mobile Tasks screen shows short AI-generated tips about the scenarios a
-- student currently has open. That screen reloads every time the tab regains
-- focus, so generating on each read would fire an LLM call per tab switch and
-- burn through the free Gemini/OpenRouter tiers.
--
-- Instead the generated tips are cached here, keyed by a fingerprint of the
-- student's open assignments (ids, statuses, deadlines, task check-off counts).
-- The route regenerates only when that fingerprint changes or the cached copy
-- ages past its TTL, so tips stay current with the student's workload without
-- one call per screen view.
--
-- One row per student: the tips always describe "right now", so there is no
-- history to keep and an upsert on the primary key is the whole write path.
-- =================================================================

create table if not exists public.student_ai_tips (
  student_id uuid primary key references public.users(id) on delete cascade,
  -- [{ title, tip, scenario_title }] as returned to the mobile client
  tips jsonb not null default '[]'::jsonb,
  -- hash of the assignment state the tips were generated from
  fingerprint text not null,
  generated_at timestamptz not null default now()
);

alter table public.student_ai_tips enable row level security;

drop policy if exists "students read own ai tips" on public.student_ai_tips;

create policy "students read own ai tips" on public.student_ai_tips
  for select using (auth.uid() = student_id);

drop policy if exists "faculty and admin read ai tips" on public.student_ai_tips;

create policy "faculty and admin read ai tips" on public.student_ai_tips
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );
