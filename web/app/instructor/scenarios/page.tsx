import type { Metadata } from "next";
import { Suspense } from "react";
import FacultyScenariosClient from "./page-client";

export const metadata: Metadata = {
  title: "Patient Cases | iCARE++ Instructor",
};

export default function FacultyScenariosPage() {
  // The client reads ?q= (a column link on a course's Progress tab), which needs
  // a Suspense boundary to prerender.
  return (
    <Suspense>
      <FacultyScenariosClient />
    </Suspense>
  );
}