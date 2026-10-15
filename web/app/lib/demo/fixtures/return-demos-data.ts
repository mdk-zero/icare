/**
 * The demo's Return Demonstrations (072): Taylor's skill checklists with no
 * patient. Their tasks are precomputed into return-demo-tasks.json by
 * scripts/demo-return-demo-tasks.ts (the catalog is too big to ship to the
 * browser); re-run it after changing the skills here.
 */
export const RETURN_DEMO_SPECS: { title: string; description: string; skills: string[] }[] = [
  {
    title: "Vital Signs Return Demonstration",
    description: "Temperature, pulse, respirations and blood pressure on a classmate, one skill after another.",
    skills: ["1-1", "1-4", "1-6", "1-7"],
  },
  {
    title: "Oxygen Therapy Return Demonstration",
    description: "Pulse oximetry, then oxygen by nasal cannula.",
    skills: ["14-1", "14-3"],
  },
];
