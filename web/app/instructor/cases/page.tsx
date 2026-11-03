import type { Metadata } from "next";
import { Suspense } from "react";
import FacultyCasesClient from "./page-client";

export const metadata: Metadata = {
  title: "Case Presentations | iCARE++ Instructor",
};

export default function FacultyCasesPage() {
  // The client reads ?q= (a column link on a course's Progress tab), which needs
  // a Suspense boundary to prerender.
  return (
    <Suspense>
      <FacultyCasesClient />
    </Suspense>
  );
}
