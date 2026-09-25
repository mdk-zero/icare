-- =================================================================
-- 051: A faculty member per team.
--
-- Admins now build a section's groups (teams) and give each one a
-- faculty member to supervise it. The faculty member sees the groups
-- assigned to them, section by section. Removing the faculty account
-- leaves the group in place without a supervisor.
-- =================================================================

alter table public.teams
  add column if not exists faculty_id uuid references public.users(id) on delete set null;

create index if not exists idx_teams_faculty on public.teams(faculty_id);
