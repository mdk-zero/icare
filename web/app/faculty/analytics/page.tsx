import type { Metadata } from "next";
import FacultyAnalyticsClient from "./page-client";

export const metadata: Metadata = {
  title: "Analytics | iCARE++ Instructor",
};

export default function FacultyAnalyticsPage() {
  return <FacultyAnalyticsClient />;
}