-- =================================================================
-- 071: Each instructor picks their own skills.
--
-- A course's skill list was shared by the Dean and every instructor
-- teaching it (course_skills). It is now the instructor's own: each
-- course offering (one instructor teaching one course in one term) has
-- its own list, so one instructor's picks never change another's.
--
-- The system starts a new offering's list with the skills the AI finds in
-- the course's details (source 'ai'); the instructor ticks the others
-- their setup needs (source 'manual').
--
-- Existing offerings start from their course's shared list, so nothing an
-- instructor sees today changes. Re-running is safe.
--
-- course_skills stays as it is, for the Dean's course list.
-- =================================================================

create table if not exists public.offering_skills (
  offering_id uuid not null references public.course_offerings(id) on delete cascade,
  skill_id text not null references public.taylor_skills(id) on delete cascade,
  source text not null default 'manual' check (source in ('manual', 'ai')),
  added_by uuid references public.users(id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (offering_id, skill_id)
);

alter table public.offering_skills enable row level security;

insert into public.offering_skills (offering_id, skill_id, source, added_by, added_at)
select o.id, cs.skill_id, cs.source, cs.added_by, cs.added_at
from public.course_offerings o
join public.course_skills cs on cs.course_id = o.course_id
on conflict do nothing;
