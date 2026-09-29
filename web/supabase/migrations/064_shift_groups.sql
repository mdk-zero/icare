-- =================================================================
-- 064: Shifts are scheduled for a group, not a whole section
--
-- Instructors supervise groups (teams.faculty_id, 051), and only see the
-- members of those groups, so a shift rosters one group. section_id stays:
-- it is filled from the group's section, and the section attendance report
-- and the dean scope still read it.
--
-- Older shifts keep team_id null and stay section-wide.
-- =================================================================

alter table public.shifts
  add column if not exists team_id uuid references public.teams(id) on delete set null;

create index if not exists idx_shifts_team on public.shifts(team_id);
