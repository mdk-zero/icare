import type { Metadata } from "next";
import FacultyAuditClient from "./page-client";

export const metadata: Metadata = {
  title: "Audit Trail | iCARE++ Instructor",
};

export default function FacultyAuditPage() {
  return <FacultyAuditClient />;
}