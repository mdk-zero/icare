import type { Metadata } from "next";
import AuditTrail from "../../components/AuditTrail";

export const metadata: Metadata = {
  title: "Activity Log | iCARE++",
};

export default function AdminAuditPage() {
  return <AuditTrail scope="own" />;
}
