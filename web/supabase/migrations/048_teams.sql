-- =================================================================
-- 048: Teams within a section.
--
-- Faculty group each section's students into teams. A team is a label
-- for assigning: giving a scenario to a team gives it to each member,
-- one scenario_assignments row per student as before, so every student
-- still works their own case and is graded on their own. The row keeps
-- the team it came through (team_id) so review can group by team.
--
-- A student is in at most one team (a student has one section, and a
-- team belongs to one section). Deleting a team keeps its assignments;
-- they just lose the label.
-- =================================================================

create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (section_id, name)
);

create index if not exists idx_teams_section on public.teams(section_id);

create table if not exists public.team_members (
  team_id uuid not null references public.teams(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (team_id, student_id),
  unique (student_id)
);

alter table public.scenario_assignments
  add column if not exists team_id uuid references public.teams(id) on delete set null;

create index if not exists idx_scenario_assignments_team on public.scenario_assignments(team_id);

-- -----------------------------------------------------------------
-- RLS. The app writes through the service role; these cover direct reads.
-- -----------------------------------------------------------------
alter table public.teams enable row level security;
alter table public.team_members enable row level security;

drop policy if exists "read teams" on public.teams;
create policy "read teams" on public.teams
  for select using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and (u.role in ('faculty', 'admin') or u.section_id = teams.section_id)
    )
  );

drop policy if exists "faculty manage own section teams" on public.teams;
create policy "faculty manage own section teams" on public.teams
  for all using (
    exists (
      select 1 from public.users u
      where u.id = auth.uid()
        and (
          u.role = 'admin'
          or exists (
            select 1 from public.faculty_sections fs
            where fs.faculty_id = u.id and fs.section_id = teams.section_id
          )
        )
    )
  );

drop policy if exists "read team members" on public.team_members;
create policy "read team members" on public.team_members
  for select using (
    -- Staff, or anyone in the team's section (a student sees who is on
    -- the teams of their own section, their own included).
    exists (
      select 1 from public.teams t
      join public.users u on u.id = auth.uid()
      where t.id = team_members.team_id
        and (u.role in ('faculty', 'admin') or u.section_id = t.section_id)
    )
  );

drop policy if exists "faculty manage team members" on public.team_members;
create policy "faculty manage team members" on public.team_members
  for all using (
    exists (
      select 1 from public.teams t
      join public.users u on u.id = auth.uid()
      where t.id = team_members.team_id
        and (
          u.role = 'admin'
          or exists (
            select 1 from public.faculty_sections fs
            where fs.faculty_id = u.id and fs.section_id = t.section_id
          )
        )
    )
  );
