-- =================================================================
-- 093: Case presentations by group.
--
-- A case presentation is a group's report: the instructor gives it to
-- groups and names a leader for each. The leader uploads the group's slides
-- (PowerPoint or PDF); every member can open them; the instructor grades
-- the group as a whole on the rubric in app/lib/case-groups.ts (six
-- weighted criteria, four levels each).
--
-- Each member keeps their case_submissions row (056), now pointing at the
-- group. Handing in and grading are copied onto those rows, so course
-- grades, reports and analytics that read a student's case score keep
-- working unchanged: every member gets the group's score.
--
-- The written case form of 056 (patient initials, observations and the
-- rest) is no longer filled in; its columns stay for now.
-- =================================================================

create table if not exists public.case_presentation_groups (
  id uuid primary key default gen_random_uuid(),
  presentation_id uuid not null references public.case_presentations(id) on delete cascade,
  team_id uuid references public.teams(id) on delete set null,
  -- Kept as given, so the label survives a renamed or deleted group.
  team_name text not null default '',
  section_name text not null default '',
  leader_id uuid references public.users(id) on delete set null,
  status case_submission_status not null default 'not_started',

  -- The group's slides, in the private case-presentations bucket.
  file_path text,
  file_name text,
  file_size bigint,
  file_type text check (file_type in ('pdf', 'pptx')),
  uploaded_by uuid references public.users(id) on delete set null,
  submitted_at timestamptz,

  score numeric(5,2),
  remarks text not null default '',
  graded_by uuid references public.users(id) on delete set null,
  graded_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (presentation_id, team_id)
);

create index if not exists idx_case_presentation_groups_presentation
  on public.case_presentation_groups(presentation_id);

-- One row per rubric criterion: a level from 1 (Beginning) to 4 (Excellent).
create table if not exists public.case_group_ratings (
  group_id uuid not null references public.case_presentation_groups(id) on delete cascade,
  criterion text not null,
  level smallint not null check (level between 1 and 4),
  remarks text not null default '',
  rated_by uuid references public.users(id) on delete set null,
  rated_at timestamptz not null default now(),
  primary key (group_id, criterion)
);

alter table public.case_submissions
  add column if not exists group_id uuid references public.case_presentation_groups(id) on delete set null;
create index if not exists idx_case_submissions_group on public.case_submissions(group_id);

alter table public.case_presentation_groups enable row level security;
alter table public.case_group_ratings enable row level security;

-- Written through the service-role API routes, which have already
-- established who is asking; these policies are defence in depth.
drop policy if exists "faculty and admin can read case groups" on public.case_presentation_groups;
create policy "faculty and admin can read case groups" on public.case_presentation_groups
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop policy if exists "members read own case group" on public.case_presentation_groups;
create policy "members read own case group" on public.case_presentation_groups
  for select using (
    exists (
      select 1 from public.case_submissions s
      where s.group_id = case_presentation_groups.id
        and s.student_id = auth.uid()
    )
  );

drop policy if exists "faculty and admin can read case group ratings" on public.case_group_ratings;
create policy "faculty and admin can read case group ratings" on public.case_group_ratings
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop policy if exists "members read own case group ratings" on public.case_group_ratings;
create policy "members read own case group ratings" on public.case_group_ratings
  for select using (
    exists (
      select 1
      from public.case_presentation_groups g
      join public.case_submissions s on s.group_id = g.id
      where g.id = case_group_ratings.group_id
        and g.status = 'graded'
        and s.student_id = auth.uid()
    )
  );

drop trigger if exists trg_case_presentation_groups_updated_at on public.case_presentation_groups;
create trigger trg_case_presentation_groups_updated_at
  before update on public.case_presentation_groups
  for each row execute function public.set_updated_at();

-- Private bucket for the groups' slides; uploads use signed upload URLs the
-- API hands out, and viewing uses short-lived signed URLs.
insert into storage.buckets (id, name, public, file_size_limit)
values ('case-presentations', 'case-presentations', false, 52428800)
on conflict (id) do update set public = false, file_size_limit = 52428800;
