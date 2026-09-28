import type { Metadata } from "next";
import CaseGradingClient from "./page-client";

export const metadata: Metadata = {
  title: "Grade Case | iCARE++ Instructor",
};

export default async function CaseGradingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CaseGradingClient submissionId={id} />;
}
