import type { Metadata } from "next";
import AdminReportsClient from "./page-client";

export const metadata: Metadata = {
  title: "Reports | iCARE++",
};

export default function AdminReportsPage() {
  return <AdminReportsClient />;
}
