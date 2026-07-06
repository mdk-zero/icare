import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Student Detail | iCARE++",
};

import StudentDetailClient from "./page-client";

export default function StudentDetailPage() {
  return <StudentDetailClient />;
}