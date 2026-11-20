/**
 * The ward floor plan's grid, in cells. Server-safe, so the layout route and
 * the demo handler can bound placements by the same size the plan is drawn at
 * (FloorPlan.tsx re-exports these; mobile/lib/floor-plan.ts mirrors them).
 */
export const GRID_COLS = 24;
export const GRID_ROWS = 16;
