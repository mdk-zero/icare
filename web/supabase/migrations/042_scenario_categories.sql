-- =================================================================
-- 042: Scenario categories become rows instead of an enum.
--
-- scenarios.category was the scenario_category enum, so only its ten
-- labels could ever be saved. The scenario APIs have accepted a
-- free-form category since the "Create new category…" option shipped,
-- but the enum rejected every custom value at insert — and categories
-- detected from an imported lesson's topics need somewhere to live.
--
-- A table rather than ALTER TYPE ... ADD VALUE: labels can be added at
-- runtime without DDL, compared case-insensitively (so "Wound care"
-- and "Wound Care" can't both exist), and carry where they came from.
--
-- scenarios.category stays a name, not an id, so every existing reader
-- (student app, filters, reports) keeps working unchanged; the foreign
-- key gives back the guarantee the enum used to, and ON UPDATE CASCADE
-- lets a category be renamed in one place.
--
-- assessments.category keeps the enum — it is out of scope here, and
-- the scenario_category type stays for it.
-- =================================================================

create table if not exists public.scenario_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique
    check (name = btrim(name) and char_length(name) between 1 and 60),
  -- preset: one of the original ten. faculty: typed on the scenario form.
  -- lesson: confirmed from the topics detected in an imported lesson.
  source text not null default 'faculty'
    check (source in ('preset', 'faculty', 'lesson')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists uq_scenario_categories_name_ci
  on public.scenario_categories (lower(name));

insert into public.scenario_categories (name, source) values
  ('Cardiac Emergency', 'preset'),
  ('Respiratory Emergency', 'preset'),
  ('Neurological Emergency', 'preset'),
  ('Trauma', 'preset'),
  ('Medical-Surgical', 'preset'),
  ('Patient Education', 'preset'),
  ('Infection Management', 'preset'),
  ('Critical Care', 'preset'),
  ('Medication Safety', 'preset'),
  ('General', 'preset')
on conflict do nothing;

-- Anything already in use gets a row too, so the foreign key below can
-- never fail on existing data. (Under the enum that is only presets.)
insert into public.scenario_categories (name, source)
select distinct category::text, 'faculty' from public.scenarios
on conflict do nothing;

alter table public.scenarios
  alter column category type text using category::text;

alter table public.scenarios drop constraint if exists scenarios_category_fkey;
alter table public.scenarios
  add constraint scenarios_category_fkey
  foreign key (category) references public.scenario_categories(name)
  on update cascade;

alter table public.scenario_categories enable row level security;

-- Written only through the service-role API routes, which have already
-- established who is asking; anyone signed in may read, like scenarios.
drop policy if exists "authenticated users can read scenario categories" on public.scenario_categories;
create policy "authenticated users can read scenario categories" on public.scenario_categories
  for select using (auth.uid() is not null);

comment on table public.scenario_categories is
  'Scenario categories. scenarios.category references name. Unique case-insensitively; source records preset / faculty-typed / confirmed from a lesson''s topics.';
