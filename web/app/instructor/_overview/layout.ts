import type { FacultyOverview } from "../../lib/api";

/** How many flagged students the attention list shows before "N more". */
export const ATTENTION_SHOWN = 6;

/**
 * Whether "Coming up" leaves the side card for its own full-width strip.
 *
 * The attention list and the side card share a grid row, so the shorter one is
 * stretched to the taller. That covers a small difference, but three students
 * beside a full side card would leave a hole, so the section moves out whenever
 * that brings the two closer. The heights are the cards' usual px per row, not
 * measurements; chips wrapping can put them off a little and stretching takes
 * up the rest.
 */
export function comingUpGoesBelow(overview: FacultyOverview, roster: number): boolean {
  const { attention_total, review_queue, due_soon } = overview;
  if (due_soon.length === 0) return false;

  const rows = Math.min(overview.attention.length, ATTENTION_SHOWN);
  const attention = rows === 0 ? 320 : 116 + rows * 76 + (roster > attention_total ? 48 : 0);

  const shownReviews = review_queue.items.length;
  const reviews =
    review_queue.total === 0
      ? 127
      : 99 + shownReviews * 54 + (review_queue.total > shownReviews ? 16 : 0);
  const comingUp = 52 + due_soon.length * 46;

  return Math.abs(reviews - attention) < Math.abs(reviews + comingUp - attention);
}
