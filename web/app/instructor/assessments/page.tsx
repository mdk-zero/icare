import type { Metadata } from "next";
import FacultyAssessmentsClient from "./page-client";

export const metadata: Metadata = {
  title: "Quizzes | iCARE++ Instructor",
};

export default function FacultyAssessmentsPage() {
  return <FacultyAssessmentsClient />;
}
