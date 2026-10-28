import type { Metadata } from "next";
import { Suspense } from "react";
import TeamsClient from "./page-client";

export const metadata: Metadata = {
  title: "Students | iCARE++ Instructor",
};

// The open course and section live in the search params, which need a
// Suspense boundary to prerender.
export default function FacultyTeamsPage() {
  return (
    <Suspense>
      <TeamsClient />
    </Suspense>
  );
}
