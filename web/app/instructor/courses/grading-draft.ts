import type { RequirementRow } from "../../lib/course-progress";
import { gradingSignature, refile, settle, type GradingSplit } from "../../lib/course-grading";

/**
 * The Grading tab's unsaved edits. `from` is the stored split the edits
 * started from and `base` its signature; `seen` is the last split the
 * server sent. Pure, so the rules below can be checked without a browser.
 */
export interface GradingDraft {
  draft: GradingSplit | null;
  base: string;
  seen: string;
  from: GradingSplit | null;
}

export function startDraft(server: GradingSplit | null): GradingDraft {
  const sig = gradingSignature(server);
  return { draft: server, base: sig, seen: sig, from: server };
}

export const isDirty = (state: GradingDraft) => gradingSignature(state.draft) !== state.base;

/**
 * Follow the server only when its split changes, and only while there are
 * no unsaved edits. Comparing with what was last seen, not with `base`,
 * keeps a just-saved split on screen while the page's refetch is still
 * bringing the old one.
 */
export function followServer(state: GradingDraft, server: GradingSplit | null): GradingDraft {
  const sig = gradingSignature(server);
  if (sig === state.seen) return state;
  return isDirty(state) ? { ...state, seen: sig } : { draft: server, base: sig, seen: sig, from: server };
}

/** After a save: the saved split is both the draft and what the next save starts from. */
export function savedDraft(state: GradingDraft, saved: GradingSplit | null): GradingDraft {
  const sig = gradingSignature(saved);
  return { ...state, draft: saved, base: sig, from: saved };
}

/**
 * What a save expects the server to hold: the split the edits started from,
 * less the items removed from the checklist or turned into attendance since,
 * which the item routes took out of the stored split too. A change made
 * anywhere else still makes them differ, so that save is refused.
 */
export function saveBase(state: GradingDraft, requirements: readonly RequirementRow[]): string {
  return gradingSignature(settle(state.from, requirements));
}

/**
 * After an item is saved: with unsaved edits, the request left the stored
 * split alone, so the item is filed in the draft and goes with the next save.
 * A clean draft is returned as it is; the server filed the item.
 */
export function afterItemSaved(state: GradingDraft, row: RequirementRow, leafId: string | null | undefined): GradingDraft {
  if (!isDirty(state) || !state.draft) return state;
  return { ...state, draft: refile(state.draft, row, leafId) };
}
