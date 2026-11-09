import type { Metadata } from "next";
import StudentWebClient from "./page-client";

export const metadata: Metadata = {
  title: "Student Web App | iCARE++",
};

export default function SuperAdminStudentWebPage() {
  return <StudentWebClient />;
}
