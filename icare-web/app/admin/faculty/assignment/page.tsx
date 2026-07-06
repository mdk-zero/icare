import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Assign Students | iCARE++",
};

import AssignStudentsClient from "./page-client";

export default function AssignStudentsPage() {
  return <AssignStudentsClient />;
}