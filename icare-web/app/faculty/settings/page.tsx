import type { Metadata } from "next";
import FacultySettingsClient from "./page-client";

export const metadata: Metadata = {
  title: "Settings | iCARE++",
};

export default function FacultySettingsPage() {
  return <FacultySettingsClient />;
}
