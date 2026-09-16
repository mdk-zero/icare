-- =================================================================
-- 035: Floor-plan placement for rooms.
--
-- The admin Rooms page gains a drag-to-arrange floor plan; faculty
-- Monitoring renders the same plan read-only with live occupancy.
-- Placement is stored in grid units (the UI draws a 24-column canvas)
-- as a rectangle per room. All four fields are set together or not at
-- all: a partially placed room cannot be drawn, so the constraint
-- refuses it rather than letting the UI guess.
--
-- Nullable on purpose — rooms start unplaced and appear in the
-- editor's tray until an admin places them.
-- =================================================================

alter table public.rooms
  add column if not exists plan_x int,
  add column if not exists plan_y int,
  add column if not exists plan_w int,
  add column if not exists plan_h int;

alter table public.rooms drop constraint if exists chk_rooms_plan_placement;
alter table public.rooms add constraint chk_rooms_plan_placement check (
  num_nonnulls(plan_x, plan_y, plan_w, plan_h) in (0, 4)
  and (plan_x is null or (
    plan_x >= 0 and plan_y >= 0
    and plan_w >= 1 and plan_h >= 1
    -- Generous ceiling: guards against nonsense values, not the real
    -- canvas bounds — those are the UI's to enforce and free to grow.
    and plan_x + plan_w <= 100 and plan_y + plan_h <= 100
  ))
);

comment on column public.rooms.plan_x is
  'Floor-plan rectangle in grid units; null (with y/w/h) = not placed. See chk_rooms_plan_placement.';
