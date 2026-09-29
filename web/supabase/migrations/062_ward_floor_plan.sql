-- =================================================================
-- 062: The ward floor plan becomes a drawing.
--
-- Rooms on the plan (035) gain a door: the wall it sits in, so the
-- plan draws a gap and a door swing there. Null reads as the south
-- (bottom) wall, so every room already placed has a door without a
-- backfill.
--
-- ward_fixtures holds everything on the plan that is not a room:
-- corridors, the nurse station, stairs, elevators, restrooms, storage,
-- and free-text labels. Each is a rectangle in the same grid units as
-- rooms, with the same bounds. Like rooms, the plan is shared by every
-- dean. The layout route replaces the whole set on each save.
--
-- Everything goes through the service role in the API routes, so RLS
-- is on with no policies.
-- =================================================================

alter table public.rooms
  add column if not exists plan_door text;

alter table public.rooms drop constraint if exists chk_rooms_plan_door;
alter table public.rooms add constraint chk_rooms_plan_door check (
  plan_door is null or plan_door in ('n', 'e', 's', 'w')
);

comment on column public.rooms.plan_door is
  'Wall the room''s door is drawn in on the floor plan (n/e/s/w); null = s.';

create table if not exists public.ward_fixtures (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (
    kind in ('corridor', 'nurse_station', 'stairs', 'elevator', 'restroom', 'storage', 'label')
  ),
  label text not null default '' check (char_length(label) <= 60),
  plan_x int not null check (plan_x >= 0),
  plan_y int not null check (plan_y >= 0),
  plan_w int not null check (plan_w >= 1),
  plan_h int not null check (plan_h >= 1),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Same generous ceiling as chk_rooms_plan_placement.
  constraint chk_ward_fixtures_bounds check (plan_x + plan_w <= 100 and plan_y + plan_h <= 100)
);

drop trigger if exists trg_ward_fixtures_updated_at on public.ward_fixtures;
create trigger trg_ward_fixtures_updated_at
  before update on public.ward_fixtures
  for each row execute function public.set_updated_at();

alter table public.ward_fixtures enable row level security;
