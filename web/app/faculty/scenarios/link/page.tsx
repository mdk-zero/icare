import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Link Patients | iCARE++",
};

import LinkPatientsClient from "./page-client";

export default function LinkPatientsPage() {
  return <LinkPatientsClient />;
}
