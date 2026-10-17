import type { Metadata } from "next";
import { Suspense } from "react";
import SupportRequestsClient from "./page-client";
import { CONTACT_EMAIL } from "../../lib/dev-team";

export const metadata: Metadata = {
  title: "Support Requests | iCARE++",
};

// The client reads ?request= (a link from the bell or the team's email),
// which needs a Suspense boundary to prerender.
export default function SuperAdminSupportPage() {
  return (
    <Suspense>
      <SupportRequestsClient contactEmail={CONTACT_EMAIL} />
    </Suspense>
  );
}
