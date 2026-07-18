-- Sections: admin-managed list (e.g. "A", "BSN 3-A"). Each student belongs to
-- one section; faculty handle one or more sections via faculty_sections, and
-- the faculty->student connection is derived from matching sections instead of
-- the legacy per-student faculty_students roster (kept for reference, no longer
-- read by the app).

create table if not exists public.sections (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  created_at timestamptz not null default now()
);

alter table public.sections enable row level security;

alter table public.users
  add column if not exists section_id uuid references public.sections(id) on delete set null;

create table if not exists public.faculty_sections (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid not null references public.users(id) on delete cascade,
  section_id uuid not null references public.sections(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (faculty_id, section_id)
);

alter table public.faculty_sections enable row level security;

create index if not exists idx_users_section on public.users(section_id);
create index if not exists idx_faculty_sections_faculty on public.faculty_sections(faculty_id);
create index if not exists idx_faculty_sections_section on public.faculty_sections(section_id);

-- Seed the section names assessment target_sections already reference.
insert into public.sections (name) values ('A'), ('B'), ('C')
  on conflict (name) do nothing;

-- target_sections stores section names; free-form sections need the fixed
-- A/B/C check from migration 017 gone.
alter table public.assessments
  drop constraint if exists assessments_target_sections_check;
