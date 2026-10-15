"use client";

import ReviewWorkspace from "./review-workspace";

/** Grading Patient Cases; Return Demonstrations use the same workspace. */
export default function FacultyScenarioReviewClient() {
  return <ReviewWorkspace kind="patient_case" />;
}
