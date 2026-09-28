import type { Metadata } from "next";
import AdminReportsClient from "./page-client";

export const metadata: Metadata = {
  title: "Reports | iCARE++ Dean",
};

export default function AdminReportsPage() {
  return <AdminReportsClient />;
}
