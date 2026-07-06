import type { Metadata } from "next";
import FacultyReportsClient from "./page-client";

export const metadata: Metadata = {
  title: "Competency Reports | iCARE++ Faculty",
};

export default function FacultyReportsPage() {
  return <FacultyReportsClient />;
}