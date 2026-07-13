import type { Metadata } from "next";
import AdminAuditClient from "./page-client";

export const metadata: Metadata = {
  title: "Activity Log | iCARE++",
};

export default function AdminAuditPage() {
  return <AdminAuditClient />;
}
