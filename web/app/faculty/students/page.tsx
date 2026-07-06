import type { Metadata } from "next";
import FacultyStudentsClient from "./page-client";

export const metadata: Metadata = {
  title: "Students | iCARE++ Faculty",
};

export default function FacultyStudentsPage() {
  return <FacultyStudentsClient />;
}