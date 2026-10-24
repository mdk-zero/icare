"use client";

import CaseEditor from "../../new/page-client";

/** Editing uses the Create Patient Case layout, filled with the saved case. */
export default function EditScenarioClient({ scenarioId }: { scenarioId: string }) {
  return <CaseEditor editId={scenarioId} />;
}
