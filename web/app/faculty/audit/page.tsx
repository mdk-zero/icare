import type { Metadata } from "next";
import FacultyAuditClient from "./page-client";

export const metadata: Metadata = {
  title: "Audit Trail | iCARE++ Faculty",
};

export default function FacultyAuditPage() {
  return <FacultyAuditClient />;
}