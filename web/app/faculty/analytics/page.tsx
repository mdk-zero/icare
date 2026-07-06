import type { Metadata } from "next";
import FacultyAnalyticsClient from "./page-client";

export const metadata: Metadata = {
  title: "Analytics | iCARE++ Faculty",
};

export default function FacultyAnalyticsPage() {
  return <FacultyAnalyticsClient />;
}