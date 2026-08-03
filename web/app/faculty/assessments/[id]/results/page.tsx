import type { Metadata } from "next";
import AssessmentResultsClient from "./page-client";

export const metadata: Metadata = {
  title: "Assessment Results | iCARE++ Faculty",
};

export default async function AssessmentResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssessmentResultsClient assessmentId={id} />;
}
