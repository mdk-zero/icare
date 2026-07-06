import type { Metadata } from "next";
import FacultyDashboard from "./page-client";

export const metadata: Metadata = {
  title: "Faculty Dashboard | iCARE++",
};

export default function FacultyPage() {
  return <FacultyDashboard />;
}