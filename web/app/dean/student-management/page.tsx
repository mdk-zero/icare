import type { Metadata } from "next";
import { Suspense } from "react";
import StudentManagementClient from "./page-client";

export const metadata: Metadata = {
  title: "Students | iCARE++",
};

// The open section lives in the search params, which need a Suspense
// boundary to prerender.
export default function StudentManagement() {
  return (
    <Suspense>
      <StudentManagementClient />
    </Suspense>
  );
}
