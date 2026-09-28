import type { Metadata } from "next";
import TeamsClient from "./page-client";

export const metadata: Metadata = {
  title: "My Groups | iCARE++ Instructor",
};

export default function FacultyTeamsPage() {
  return <TeamsClient />;
}
