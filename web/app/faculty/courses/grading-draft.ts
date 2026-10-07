import { gradingSignature, type GradingSplit } from "../../lib/course-grading";

/**
 * The Grading tab's unsaved edits. `base` is the signature of the split the
 * edits started from (what a save must still find stored); `seen` is the
 * last split the server sent. Pure, so the rules below can be checked
 * without a browser.
 */
export interface GradingDraft {
  draft: GradingSplit | null;
  base: string;
  seen: string;
}

export function startDraft(server: GradingSplit | null): GradingDraft {
  const sig = gradingSignature(server);
  return { draft: server, base: sig, seen: sig };
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
  return isDirty(state) ? { ...state, seen: sig } : { draft: server, base: sig, seen: sig };
}

/** After a save: the saved split is both the draft and what the next save starts from. */
export function savedDraft(state: GradingDraft, saved: GradingSplit | null): GradingDraft {
  const sig = gradingSignature(saved);
  return { ...state, draft: saved, base: sig };
}
