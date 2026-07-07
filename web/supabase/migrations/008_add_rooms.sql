-- =================================================================
-- 008: Rooms and room assignments (DFD Process 2.0, ERD Rooms cluster)
-- =================================================================

do $$ begin
  create type room_status as enum ('active', 'inactive', 'maintenance');
exception when duplicate_object then null; end $$;

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  campus_id uuid references public.campuses(id) on delete set null,
  name text not null,
  room_number text not null,
  capacity int not null default 0 check (capacity >= 0),
  status room_status not null default 'active',
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campus_id, room_number)
);

create index if not exists idx_rooms_campus_id on public.rooms(campus_id);
create index if not exists idx_rooms_status on public.rooms(status);

alter table public.rooms enable row level security;

drop policy if exists "authenticated users can read rooms" on public.rooms;

create policy "authenticated users can read rooms" on public.rooms
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('student', 'faculty', 'admin')
    )
  );

drop policy if exists "admin can manage rooms" on public.rooms;

create policy "admin can manage rooms" on public.rooms
  for all using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role = 'admin'
    )
  );

drop trigger if exists trg_rooms_updated_at on public.rooms;
create trigger trg_rooms_updated_at
  before update on public.rooms
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------

create table if not exists public.room_assignments (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  student_id uuid not null references public.users(id) on delete cascade,
  assigned_by uuid references public.users(id) on delete set null,
  shift text,                       -- e.g. 'AM', 'PM', 'Night'
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_room_assignments_room_id on public.room_assignments(room_id);
create index if not exists idx_room_assignments_student_id on public.room_assignments(student_id);

alter table public.room_assignments enable row level security;

drop policy if exists "students read own room assignments" on public.room_assignments;

create policy "students read own room assignments" on public.room_assignments
  for select using (auth.uid() = student_id);

drop policy if exists "faculty and admin read room assignments" on public.room_assignments;

create policy "faculty and admin read room assignments" on public.room_assignments
  for select using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );

drop policy if exists "faculty and admin manage room assignments" on public.room_assignments;

create policy "faculty and admin manage room assignments" on public.room_assignments
  for all using (
    exists (
      select 1 from public.users
      where public.users.id = auth.uid()
        and public.users.role in ('faculty', 'admin')
    )
  );
