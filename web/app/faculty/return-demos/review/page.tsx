import type { Metadata } from "next";
import { Suspense } from "react";
import ReturnDemoReviewClient from "./page-client";

export const metadata: Metadata = {
  title: "Grade Return Demonstrations | iCARE++ Instructor",
};

export default function ReturnDemoReviewPage() {
  // useSearchParams (?scenario=) needs a boundary on a page that is otherwise static.
  return (
    <Suspense>
      <ReturnDemoReviewClient />
    </Suspense>
  );
}
