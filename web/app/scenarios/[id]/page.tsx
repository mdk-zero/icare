import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Simulation Scenario | iCARE++",
};

import ScenarioRunnerClient from "./page-client";

export default function ScenarioRunnerPage() {
  return <ScenarioRunnerClient />;
}