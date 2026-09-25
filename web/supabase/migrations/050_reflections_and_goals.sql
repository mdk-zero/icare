-- =================================================================
-- 050: Student reflections and improvement goals.
--
-- Once a scenario is finalized or a skill assessment is scored, the
-- student reads their feedback — faculty remarks, plus an AI summary
-- of strengths and areas to improve per Taylor's skill — then writes a
-- short reflection and sets one to three goals. Faculty read both on
-- the student's profile.
--
-- One reflection per student per graded piece of work (source_type +
-- source_id: a scenario_assignments or assessment_attempts id; not a
-- foreign key since it points at one of two tables). The AI feedback is
-- cached on the row with the signature of the grades it describes, so
-- it is generated once and regenerated only if the grades change.
--
-- A goal may name the Taylor's skill it is about, and is open until the
-- student (or faculty) marks it met.
-- =================================================================

create table if not exists public.student_reflections (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  source_type text not null check (source_type in ('scenario', 'assessment')),
  source_id uuid not null,
  reflection text not null default '' check (char_length(reflection) <= 4000),
  ai_feedback jsonb,
  ai_signature text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, source_type, source_id)
);

create index if not exists idx_student_reflections_student on public.student_reflections(student_id, created_at desc);

create table if not exists public.student_goals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  reflection_id uuid references public.student_reflections(id) on delete cascade,
  text text not null check (char_length(btrim(text)) between 1 and 300),
  skill_id text references public.taylor_skills(id) on delete set null,
  status text not null default 'open' check (status in ('open', 'met')),
  target_date date,
  created_at timestamptz not null default now(),
  met_at timestamptz
);

create index if not exists idx_student_goals_student on public.student_goals(student_id, status);

-- -----------------------------------------------------------------
-- RLS. The app reads and writes through the service role, checking the
-- student or the faculty member's sections itself; these cover direct reads.
-- -----------------------------------------------------------------
alter table public.student_reflections enable row level security;
alter table public.student_goals enable row level security;

drop policy if exists "students own reflections" on public.student_reflections;
create policy "students own reflections" on public.student_reflections
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists "faculty read section reflections" on public.student_reflections;
create policy "faculty read section reflections" on public.student_reflections
  for select using (
    exists (
      select 1 from public.users s
      join public.faculty_sections fs on fs.section_id = s.section_id
      where s.id = student_reflections.student_id and fs.faculty_id = auth.uid()
    )
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );

drop policy if exists "students own goals" on public.student_goals;
create policy "students own goals" on public.student_goals
  for all using (student_id = auth.uid()) with check (student_id = auth.uid());

drop policy if exists "faculty read section goals" on public.student_goals;
create policy "faculty read section goals" on public.student_goals
  for select using (
    exists (
      select 1 from public.users s
      join public.faculty_sections fs on fs.section_id = s.section_id
      where s.id = student_goals.student_id and fs.faculty_id = auth.uid()
    )
    or exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'admin')
  );
