import type { Metadata } from "next";
import FacultyDashboard from "./page-client";

export const metadata: Metadata = {
  title: "Instructor Dashboard | iCARE++",
};

export default function FacultyPage() {
  return <FacultyDashboard />;
}