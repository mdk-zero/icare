import type { Metadata } from "next";
import EditScenarioClient from "./page-client";

export const metadata: Metadata = {
  title: "Edit Scenario | iCARE++",
};

export default async function EditScenarioPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <EditScenarioClient scenarioId={id} />;
}
