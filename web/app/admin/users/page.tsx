import type { Metadata } from "next";
import { Suspense } from "react";
import SuperAdminUsersClient from "./page-client";

export const metadata: Metadata = {
  title: "Users | iCARE++",
};

// The client reads search params (an Accept from the notifications), which
// needs a Suspense boundary to prerender.
export default function SuperAdminUsersPage() {
  return (
    <Suspense>
      <SuperAdminUsersClient />
    </Suspense>
  );
}
