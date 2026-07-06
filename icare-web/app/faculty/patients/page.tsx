import type { Metadata } from "next";
import FacultyPatientsClient from "./page-client";

export const metadata: Metadata = {
  title: "Patient Records | iCARE++ Faculty",
};

export default function FacultyPatientsPage() {
  return <FacultyPatientsClient />;
}