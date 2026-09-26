import type { Metadata } from "next";
import SuperAdminDashboardClient from "./page-client";

export const metadata: Metadata = {
  title: "Dashboard | iCARE++",
};

export default function SuperAdminDashboardPage() {
  return <SuperAdminDashboardClient />;
}
