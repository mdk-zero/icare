-- =================================================================
-- 013: Assistance requests + service feedback (ERD entities)
--
-- assistance_requests: student raises a help flag during simulation
-- service_feedback: post-use ratings feeding the manuscript's Ch. IV
--   usability evaluation (Objective 4.3)
-- =================================================================

do $$ begin
  create type assistance_status as enum ('open', 'acknowledged', 'resolved');
exception when duplicate_object then null; end $$;

create table if not exists public.assistance_requests (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.users(id) on delete cascade,
  room_id uuid references public.rooms(id) on delete set null,
  patient_id uuid references public.patients(id) on delete set null,
  message text not null default '',
  status assistance_status not null default 'open',
  created_at timestamptz not null default now(),
  resolved_by uuid references public.users(id) on delete set null,
  resolved_at timestamptz
);

create index if not exists idx_assistance_requests_student
  on public.assistance_requests(student_id, created_at desc);
create index if not exists idx_assistance_requests_open
  on public.assistance_requests(status) where status <> 'resolved';

alter table public.assistance_requests enable row level security;

drop policy if exists "students manage own assistance requests" on public.assistance_requests;

create policy "students manage own assistance requests" on public.assistance_requests
  for all using (auth.uid() = student_id);

drop policy if exists "faculty and admin manage assistance requests" on public.assistance_requests;

create policy "faculty and admin manage assistance requests" on public.assistance_requests
  for all using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

-- -----------------------------------------------------------------

create table if not exists public.service_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  rating int not null check (rating between 1 and 5),
  category text,                        -- e.g. 'usability', 'performance'
  comments text,
  created_at timestamptz not null default now()
);

create index if not exists idx_service_feedback_user on public.service_feedback(user_id);

alter table public.service_feedback enable row level security;

drop policy if exists "users manage own feedback" on public.service_feedback;

create policy "users manage own feedback" on public.service_feedback
  for all using (auth.uid() = user_id);

drop policy if exists "admin reads all feedback" on public.service_feedback;

create policy "admin reads all feedback" on public.service_feedback
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role = 'admin'
    )
  );
