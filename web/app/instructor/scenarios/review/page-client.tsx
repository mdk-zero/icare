"use client";

import { useSearchParams } from "next/navigation";
import ReviewWorkspace from "./review-workspace";

/**
 * Grading Patient Cases; Return Demonstrations use the same workspace. A
 * card's Review opens it with ?case=<id>, narrowed to that patient case.
 */
export default function FacultyScenarioReviewClient() {
  const caseId = useSearchParams().get("case");
  return <ReviewWorkspace kind="patient_case" scenarioId={caseId} />;
}
