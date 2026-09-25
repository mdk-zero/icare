-- =================================================================
-- 045: The Taylor's skills catalog — every skill and checklist step.
--
-- 041 made the 18 chapters of Lynn & LeBon, "Skill Checklists for
-- Taylor's Clinical Nursing Skills" (3rd ed.) the skill areas, but the
-- 188 skills inside them only existed as citations in text ("Skill
-- 5-23"). This stores the whole book: one row per skill (its number,
-- title and goal) and one row per checklist step, word for word, so
-- scenarios can be built from a skill's steps and skill assessments
-- can be written against them.
--
-- A skill's id is its number ('5-23'); its chapter is the competency
-- area 041 seeded for that chapter. Step numbers are what the book
-- prints and repeat inside a skill's variants (oral, rectal, axillary
-- temperature each restart at 10), so a step is keyed by its position.
--
-- The rows come from web/scripts/data/taylor-skills.json, extracted
-- from the PDF in docs/:  npx tsx scripts/seed-taylor-skills.ts
-- Everyone signed in can read the catalog; only the service role
-- writes it.
-- =================================================================

create table if not exists public.taylor_skills (
  id text primary key check (id ~ '^\d{1,2}-\d{1,2}$'),
  chapter_id uuid not null references public.competency_areas(id) on delete restrict,
  chapter int not null,
  number int not null,
  title text not null,
  goal text not null default '',
  unique (chapter, number)
);

create index if not exists idx_taylor_skills_chapter on public.taylor_skills(chapter_id);

create table if not exists public.taylor_skill_steps (
  id uuid primary key default gen_random_uuid(),
  skill_id text not null references public.taylor_skills(id) on delete cascade,
  position int not null,
  -- the number the book prints; repeats across a skill's variants
  step_no int not null,
  -- the variant heading, e.g. 'Assessing Oral Temperature'
  section text,
  text text not null,
  unique (skill_id, position)
);

create index if not exists idx_taylor_skill_steps_skill on public.taylor_skill_steps(skill_id);

alter table public.taylor_skills enable row level security;
alter table public.taylor_skill_steps enable row level security;

drop policy if exists "read taylor skills" on public.taylor_skills;
create policy "read taylor skills" on public.taylor_skills
  for select using (auth.uid() is not null);

drop policy if exists "read taylor skill steps" on public.taylor_skill_steps;
create policy "read taylor skill steps" on public.taylor_skill_steps
  for select using (auth.uid() is not null);
