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
  {
    title: "Blood Pressure and Apical Pulse Return Demonstration",
    description: "Brachial blood pressure with a palpated estimate first, then the apical pulse counted for a full minute.",
    skills: ["1-7", "1-5"],
  },
  {
    title: "IV Site Care Return Demonstration",
    description: "Checking a peripheral IV site and infusion, changing its dressing, then capping and flushing it for intermittent use.",
    skills: ["15-3", "15-4", "15-5"],
  },
  {
    title: "General Survey and Skin Assessment Return Demonstration",
    description: "A general survey of a classmate, then the skin, hair and nails, describing what you see as you go.",
    skills: ["2-1", "2-3"],
  },
  {
    title: "Thorax and Lungs Assessment Return Demonstration",
    description: "Inspect, palpate, percuss and auscultate a classmate's chest, front and back.",
    skills: ["2-5"],
  },
  {
    title: "Temperature by Three Routes Return Demonstration",
    description: "Oral, axillary and tympanic temperatures on a classmate, with the right probe and wait for each.",
    skills: ["1-1"],
  },
  {
    title: "Cardiovascular Assessment Return Demonstration",
    description: "Heart sounds at the five areas, then the apical pulse, neck veins and capillary refill on a classmate.",
    skills: ["2-6", "1-5"],
  },
  {
    title: "Starting a Peripheral IV Return Demonstration",
    description: "Prepare the solution and administration set, then start a peripheral IV on a training arm.",
    skills: ["15-1"],
  },
  {
    title: "Incentive Spirometer Teaching Return Demonstration",
    description: "Teach a classmate to use an incentive spirometer and get a return demonstration.",
    skills: ["14-2"],
  },
  {
    title: "Oxygen by Face Mask Return Demonstration",
    description: "Pulse oximetry, then oxygen by simple face mask, checking the fit and the skin.",
    skills: ["14-1", "14-4"],
  },
  {
    title: "Saline Lock Flush Return Demonstration",
    description: "Cap a peripheral venous access device for intermittent use and flush it.",
    skills: ["15-5"],
  },
  {
    title: "Changing an IV Container and Tubing Return Demonstration",
    description: "Hang a new IV solution container and change the administration set without contaminating the line.",
    skills: ["15-2"],
  },
  {
    title: "Oropharyngeal Suctioning Return Demonstration",
    description: "Suction the oropharynx of a manikin safely, oxygenating before and after.",
    skills: ["14-6"],
  },
];
