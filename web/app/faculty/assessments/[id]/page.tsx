import type { Metadata } from "next";
import AssessmentQuestionsClient from "./page-client";

export const metadata: Metadata = {
  title: "Manage Questions | iCARE++ Instructor",
};

export default async function AssessmentQuestionsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AssessmentQuestionsClient assessmentId={id} />;
}
