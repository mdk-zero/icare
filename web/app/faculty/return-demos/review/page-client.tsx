"use client";

import { useSearchParams } from "next/navigation";
import ReviewWorkspace from "../../scenarios/review/review-workspace";

/**
 * Grading Return Demonstrations on the Patient Case checklist sheet. A card's
 * Grade opens it with ?scenario=<id>, narrowing the queue to that one; the
 * chip's × clears it without a navigation (useSearchParams follows
 * replaceState).
 */
export default function ReturnDemoReviewClient() {
  const scenarioId = useSearchParams().get("scenario");
  return (
    <ReviewWorkspace
      kind="return_demo"
      scenarioId={scenarioId}
      onClearScenario={() => window.history.replaceState(null, "", "/faculty/return-demos/review")}
    />
  );
}
