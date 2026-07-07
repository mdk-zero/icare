import type { Metadata } from "next";
import FacultyAssessmentsClient from "./page-client";

export const metadata: Metadata = {
  title: "Question Bank | iCARE++ Faculty",
};

export default function FacultyAssessmentsPage() {
  return <FacultyAssessmentsClient />;
}
