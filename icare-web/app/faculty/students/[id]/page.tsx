import type { Metadata } from "next";
import StudentDetailClient from "./page-client";

export const metadata: Metadata = {
  title: "Student Detail | iCARE++ Faculty",
};

export default function StudentDetailPage() {
  return <StudentDetailClient />;
}