import type { Metadata } from "next";
import { Suspense } from "react";
import ReturnDemosClient from "./page-client";

export const metadata: Metadata = {
  title: "Return Demonstrations | iCARE++ Instructor",
};

export default function ReturnDemosPage() {
  // The client reads ?q= (a column link on a course's Progress tab), which needs
  // a Suspense boundary to prerender.
  return (
    <Suspense>
      <ReturnDemosClient />
    </Suspense>
  );
}
