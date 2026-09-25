import type { Metadata } from "next";
import FacultyAssessmentsClient from "./page-client";

export const metadata: Metadata = {
  title: "Skill Assessments | iCARE++ Faculty",
};

export default function FacultyAssessmentsPage() {
  return <FacultyAssessmentsClient />;
}
