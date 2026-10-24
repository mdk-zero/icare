import type { Metadata } from "next";
import FacultyScenarioReviewClient from "./page-client";

export const metadata: Metadata = {
  title: "Review Submissions | iCARE++ Instructor",
};

export default function FacultyScenarioReviewPage() {
  return <FacultyScenarioReviewClient />;
}
