import type { Metadata } from "next";
import PageHeader from "../components/PageHeader";

export const metadata: Metadata = {
  title: "Dashboard | iCARE++",
};

export default function SuperAdminDashboardPage() {
  return <PageHeader title="System Dashboard" subtitle="Accounts, performance and test results at a glance" />;
}
