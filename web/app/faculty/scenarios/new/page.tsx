import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "New Patient Case | iCARE++",
};

import NewScenarioClient from "./page-client";

export default function NewScenarioPage() {
  return <NewScenarioClient />;
}
