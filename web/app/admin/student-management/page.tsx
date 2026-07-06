import type { Metadata } from "next";
import StudentManagementClient from "./page-client";

export const metadata: Metadata = {
  title: "Students | iCARE++",
};

export default function StudentManagement() {
  return <StudentManagementClient />;
}