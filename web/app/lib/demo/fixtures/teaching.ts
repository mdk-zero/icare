import suggestions from "@/scripts/data/library-suggestions.json";
import { CASE_CRITERIA } from "@/app/lib/case-rubric";
import type { TaskRating } from "@/app/lib/task-ratings";
import {
  DEAN_ID,
  INSTRUCTOR_2_ID,
  INSTRUCTOR_3_ID,
  INSTRUCTOR_ID,
  KIND,
  SECTION_A,
  SECTION_B,
  ago,
  ahead,
  demoId,
  type DemoUser,
} from "./people";

/** Case presentations with the students' write-ups, and the Library's materials. */

export interface DemoCasePresentation {
  id: string;
  title: string;
  instructions: string;
  deadline: string | null;
  section_ids: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** The course offering it was made for (070); null for none, absent in demos saved before. */
  offering_id?: string | null;
}

export interface DemoCaseSubmission {
  id: string;
  presentation_id: string;
  student_id: string;
  status: "not_started" | "draft" | "submitted" | "graded";
  patient_initials: string | null;
  age: number | null;
  sex: "male" | "female" | null;
  hospital: string;
  ward: string;
  admitting_diagnosis: string;
  chief_complaint: string;
  history: string;
  medications: string;
  nursing_diagnoses: string;
  interventions: string;
  observations: {
    vitals: {
      heart_rate: number | null;
      bp_systolic: number | null;
      bp_diastolic: number | null;
      temperature_c: number | null;
      respiratory_rate: number | null;
      oxygen_saturation: number | null;
      pain_score: number | null;
      notes: string;
      observed_at: string | null;
    }[];
    tpr: { temperature_c: number | null; pulse: number | null; respiration: number | null; remarks: string; observed_at: string | null }[];
    ivf: { solution: string; volume_ml: number | null; rate_ml_hr: number | null; site: string; remarks: string; observed_at: string | null }[];
  };
  submitted_at: string | null;
  graded_at: string | null;
  graded_by: string | null;
  score: number | null;
  remarks: string;
  ratings: { criterion: string; rating: TaskRating; remarks: string }[];
  updated_at: string;
}

export interface DemoMaterial {
  id: string;
  skill_id: string;
  kind: "video" | "note" | "pdf" | "slides" | "link";
  title: string;
  description: string;
  youtube_id: string | null;
  body_md: string | null;
  url: string | null;
  file_path: string | null;
  file_name: string | null;
  file_size: number | null;
  mime_type: string | null;
  target_sections: string[] | null;
  status: "draft" | "published";
  published_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  views: number;
}

const WRITEUPS = [
  {
    initials: "R.D.",
    age: 21,
    sex: "female" as const,
    diagnosis: "Acute viral upper respiratory infection with fever",
    complaint: "Fever and body aches for two days",
    history: "Previously well. Onset of sore throat and fever two days before admission. No travel, no sick contacts at home.",
    meds: "Paracetamol 500 mg PO q6h PRN for T > 38.0 °C",
    dx: "1. Hyperthermia related to viral infection as evidenced by T 38.2 °C, flushed warm skin.\n2. Risk for deficient fluid volume related to fever and reduced intake.",
    interventions:
      "Monitored temperature, pulse and respirations q4h. Gave paracetamol as ordered and rechecked temperature after 1 hour (37.6 °C). Encouraged 2 L oral fluids. Taught the patient to report breathlessness.",
  },
  {
    initials: "M.S.",
    age: 34,
    sex: "male" as const,
    diagnosis: "Acute gastroenteritis with mild dehydration",
    complaint: "Loose stools and vomiting for two days",
    history: "Ate at a roadside eatery two days before admission. Six loose stools and three episodes of vomiting a day since.",
    meds: "PNSS 1 L x 8 hours; oral rehydration salts after each loose stool",
    dx: "1. Deficient fluid volume related to active fluid loss as evidenced by dry mucous membranes and HR 102.\n2. Risk for electrolyte imbalance related to diarrhoea (K 3.4).",
    interventions:
      "Assisted with IV insertion and monitored the site hourly for infiltration. Kept strict intake and output. Pulse and blood pressure q2h; HR settled to 88 by the end of the shift.",
  },
];

export function seedTeaching(users: DemoUser[]) {
  const presentations: DemoCasePresentation[] = [
    {
      id: demoId(KIND.casePresentation, 1),
      title: "Case Presentation 1: A patient from your first ward week",
      instructions:
        "Choose one patient you cared for during your first ward week. Present them with initials only — no names, birthdays or hospital numbers. Cover the profile, your assessment findings, two prioritised nursing diagnoses and the care you gave.",
      deadline: ago(9, 23, 59),
      section_ids: [SECTION_A],
      created_by: INSTRUCTOR_ID,
      created_at: ago(24),
      updated_at: ago(24),
    },
    {
      id: demoId(KIND.casePresentation, 2),
      title: "Case Presentation 2: Fluid balance",
      instructions:
        "Present a patient on IV therapy. Include the IV fluid, rate and site, every site check you documented, and how the patient's vital signs responded.",
      deadline: ahead(5, 23, 59),
      section_ids: [SECTION_A, SECTION_B],
      created_by: INSTRUCTOR_ID,
      created_at: ago(3),
      updated_at: ago(3),
    },
  ];

  const students = users.filter((u) => u.role === "student");
  const submissions: DemoCaseSubmission[] = [];
  let n = 0;
  const RATINGS: TaskRating[] = ["excellent", "satisfactory", "satisfactory", "excellent", "satisfactory"];

  for (const p of presentations) {
    const roster = students.filter((s) => s.section_id && p.section_ids.includes(s.section_id));
    roster.forEach((s, i) => {
      n += 1;
      const w = WRITEUPS[i % WRITEUPS.length];
      const weak = s.risk_level === "at_risk";
      const first = p === presentations[0];
      // First presentation: almost all graded. Second: a mix of stages.
      const status: DemoCaseSubmission["status"] = first
        ? weak
          ? "submitted"
          : "graded"
        : i % 4 === 0
          ? "submitted"
          : i % 4 === 1
            ? "draft"
            : weak
              ? "not_started"
              : i % 4 === 2
                ? "draft"
                : "not_started";
      const filled = status !== "not_started";
      const ratings =
        status === "graded"
          ? CASE_CRITERIA.map((c, k) => ({
              criterion: c.key,
              rating: (i + k) % 5 === 0 ? ("needs_practice" as TaskRating) : RATINGS[(i + k) % RATINGS.length],
              remarks: k === 2 ? "Prioritise the diagnosis that threatens the patient first." : "",
            }))
          : [];
      const credit = { excellent: 1, satisfactory: 2 / 3, needs_practice: 1 / 3 };
      const score = ratings.length ? Math.round((ratings.reduce((sum, r) => sum + credit[r.rating], 0) / ratings.length) * 100) : null;
      // The weaker students handed the first one in a day late.
      const submittedAt =
        status === "submitted" || status === "graded" ? (first ? (weak ? ago(8, 10) : ago(10 + (i % 3) * 0.3, 21)) : ago(1 + (i % 2), 20)) : null;
      submissions.push({
        id: demoId(KIND.caseSubmission, n),
        presentation_id: p.id,
        student_id: s.id,
        status,
        patient_initials: filled ? w.initials : null,
        age: filled ? w.age : null,
        sex: filled ? w.sex : null,
        hospital: filled ? "Batangas Medical Center" : "",
        ward: filled ? "Medical Ward 3B" : "",
        admitting_diagnosis: filled ? w.diagnosis : "",
        chief_complaint: filled ? w.complaint : "",
        history: filled ? w.history : "",
        medications: filled ? w.meds : "",
        nursing_diagnoses: status === "draft" && i % 2 ? "" : filled ? w.dx : "",
        interventions: status === "draft" ? "" : filled ? w.interventions : "",
        observations: {
          vitals: filled
            ? [
                { heart_rate: 96, bp_systolic: 118, bp_diastolic: 74, temperature_c: 38.2, respiratory_rate: 20, oxygen_saturation: 98, pain_score: 3, notes: "On admission", observed_at: ago(12, 8) },
                { heart_rate: 88, bp_systolic: 116, bp_diastolic: 72, temperature_c: 37.4, respiratory_rate: 18, oxygen_saturation: 99, pain_score: 2, notes: "After paracetamol", observed_at: ago(12, 12) },
              ]
            : [],
          tpr: [],
          ivf: filled && i % 2 ? [{ solution: "PNSS", volume_ml: 1000, rate_ml_hr: 125, site: "Left forearm, 20G", remarks: "Site clean, no swelling", observed_at: ago(12, 9) }] : [],
        },
        submitted_at: submittedAt,
        graded_at: status === "graded" ? ago(7, 15) : null,
        graded_by: status === "graded" ? INSTRUCTOR_ID : null,
        score,
        remarks: status === "graded" ? (score && score >= 80 ? "Clear, well-organised presentation." : "Good effort — tie each intervention back to a diagnosis.") : "",
        ratings,
        updated_at: submittedAt ?? ago(2),
      });
    });
  }

  // Library: a published video per active skill from the suggestions, plus notes and a link.
  const authors = [INSTRUCTOR_ID, INSTRUCTOR_2_ID, INSTRUCTOR_3_ID, DEAN_ID];
  const picks = (suggestions as { skill_id: string; youtube_id: string; title: string; channel: string }[])
    .filter((s) => ["1-1", "1-4", "1-7", "14-1", "14-3", "15-1", "15-3"].includes(s.skill_id))
    .filter((s, i, all) => all.findIndex((x) => x.skill_id === s.skill_id) === i);
  const materials: DemoMaterial[] = picks.map((s, i) => ({
    id: demoId(KIND.material, i + 1),
    skill_id: s.skill_id,
    kind: "video",
    title: s.title,
    description: `A walkthrough from ${s.channel}. Watch it before your return demonstration.`,
    youtube_id: s.youtube_id,
    body_md: null,
    url: null,
    file_path: null,
    file_name: null,
    file_size: null,
    mime_type: null,
    target_sections: null,
    status: "published",
    published_at: ago(30 - i * 2),
    created_by: authors[i % authors.length],
    created_at: ago(31 - i * 2),
    updated_at: ago(30 - i * 2),
    views: 14 + ((i * 7) % 11),
  }));
  materials.push(
    {
      id: demoId(KIND.material, 50),
      skill_id: "1-7",
      kind: "note",
      title: "Blood pressure: the five mistakes we see most",
      description: "A one-page checklist to read before your blood pressure return demonstration.",
      youtube_id: null,
      body_md:
        "## Before you inflate\n\n- **Wrong cuff size.** The bladder should circle 80% of the arm.\n- **No palpated estimate.** Find the systolic by palpation first so you don't miss an auscultatory gap.\n\n## While you deflate\n\n- **Too fast.** 2–3 mm Hg per second.\n- **Arm not at heart level.**\n- **Talking.** Neither you nor the patient should talk during the reading.",
      url: null,
      file_path: null,
      file_name: null,
      file_size: null,
      mime_type: null,
      target_sections: null,
      status: "published",
      published_at: ago(15),
      created_by: INSTRUCTOR_ID,
      created_at: ago(15),
      updated_at: ago(15),
      views: 27,
    },
    {
      id: demoId(KIND.material, 51),
      skill_id: "15-3",
      kind: "note",
      title: "IV site checks: what to look for each hour",
      description: "Draft — infiltration vs phlebitis, with the grading scales.",
      youtube_id: null,
      body_md: "## Infiltration\n\nCool, pale, swollen skin around the site; the infusion slows or stops.\n\n## Phlebitis\n\nWarmth, redness and a tender cord along the vein.",
      url: null,
      file_path: null,
      file_name: null,
      file_size: null,
      mime_type: null,
      target_sections: ["BSN 3101"],
      status: "draft",
      published_at: null,
      created_by: INSTRUCTOR_ID,
      created_at: ago(2),
      updated_at: ago(2),
      views: 0,
    },
  );

  return { casePresentations: presentations, caseSubmissions: submissions, materials };
}
