import type { Metadata } from "next";
import CasePresentationClient from "./page-client";

export const metadata: Metadata = {
  title: "Case Presentation | iCARE++ Faculty",
};

export default async function CasePresentationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CasePresentationClient presentationId={id} />;
}
