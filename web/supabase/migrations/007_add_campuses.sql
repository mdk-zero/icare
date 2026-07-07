-- =================================================================
-- 007: Campuses (multi-campus readiness, Objective 2.4)
--
-- Design note: the existing `admin` role is treated as the Dean /
-- super administrator tier (manuscript Fig. 6). No new enum value is
-- added so existing auth code keeps working.
-- =================================================================

create table if not exists public.campuses (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  code text not null unique,
  address text,
  created_at timestamptz not null default now()
);

alter table public.campuses enable row level security;

drop policy if exists "authenticated users can read campuses" on public.campuses;

create policy "authenticated users can read campuses" on public.campuses
  for select using (true);

insert into public.campuses (name, code, address)
values (
  'Batangas State University – TNEU ARASOF Nasugbu',
  'ARASOF-NASUGBU',
  'Nasugbu, Batangas, Philippines'
)
on conflict (code) do nothing;

alter table public.users
  add column if not exists campus_id uuid references public.campuses(id) on delete set null;

create index if not exists idx_users_campus_id on public.users(campus_id);

-- Backfill existing users onto the primary campus.
update public.users
set campus_id = (select id from public.campuses where code = 'ARASOF-NASUGBU')
where campus_id is null;
