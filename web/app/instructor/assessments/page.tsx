import type { Metadata } from "next";
import { Suspense } from "react";
import FacultyAssessmentsClient from "./page-client";

export const metadata: Metadata = {
  title: "Quizzes | iCARE++ Instructor",
};

export default function FacultyAssessmentsPage() {
  // The client reads ?q= (a column link on a course's Progress tab), which needs
  // a Suspense boundary to prerender.
  return (
    <Suspense>
      <FacultyAssessmentsClient />
    </Suspense>
  );
}
