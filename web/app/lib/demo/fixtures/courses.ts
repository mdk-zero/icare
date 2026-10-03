import { addDays, manilaToday, type RequirementCheckRow, type RequirementRow } from "../../course-progress";
import { DEAN_ID, INSTRUCTOR_2_ID, INSTRUCTOR_ID, SECTION_A, SECTION_B, ago, demoId, KIND } from "./people";
import type { DemoScenario } from "./school";
import type { DemoCasePresentation } from "./teaching";

/**
 * The Dean's terms and courses, and who teaches what (migration 065). The
 * current term is placed around today, so the demo always has a term in
 * progress, with an ended one before it.
 */

export interface DemoTerm {
  id: string;
  admin_id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  created_at: string;
}

export interface DemoCourse {
  id: string;
  admin_id: string;
  code: string;
  title: string;
  description: string;
  created_at: string;
}

export interface DemoCourseSkill {
  course_id: string;
  skill_id: string;
  source: "manual" | "ai";
}

export interface DemoOffering {
  id: string;
  course_id: string;
  term_id: string;
  faculty_id: string | null;
  section_ids: string[];
  created_at: string;
}

export type DemoRequirement = RequirementRow & { created_at: string };
export type DemoRequirementCheck = RequirementCheckRow;

export const TERM_CURRENT = demoId(KIND.misc, 501);
export const TERM_PAST = demoId(KIND.misc, 502);
export const COURSE_NCM103 = demoId(KIND.misc, 511);
export const COURSE_NCM112 = demoId(KIND.misc, 512);
export const OFFERING_MAIN = demoId(KIND.misc, 521);

/** "1st Semester AY 2026–2027" for the semester containing `date`. */
function semesterName(date: string): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  return month >= 6
    ? `1st Semester AY ${year}–${year + 1}`
    : `2nd Semester AY ${year - 1}–${year}`;
}

export interface DemoCourseTables {
  terms: DemoTerm[];
  courses: DemoCourse[];
  courseSkills: DemoCourseSkill[];
  offerings: DemoOffering[];
  requirements: DemoRequirement[];
  requirementChecks: DemoRequirementCheck[];
}

export function seedCourses(input: {
  scenarios: DemoScenario[];
  casePresentations: DemoCasePresentation[];
}): DemoCourseTables {
  const today = manilaToday();
  const currentStart = addDays(today, -60);
  const pastEnd = addDays(currentStart, -21);
  const pastStart = addDays(pastEnd, -125);

  const terms: DemoTerm[] = [
    { id: TERM_CURRENT, admin_id: DEAN_ID, name: semesterName(currentStart), starts_on: currentStart, ends_on: addDays(today, 75), created_at: ago(70) },
    { id: TERM_PAST, admin_id: DEAN_ID, name: semesterName(pastStart), starts_on: pastStart, ends_on: pastEnd, created_at: ago(220) },
  ];
  // Two semesters can share a name when the dates straddle June; keep them distinct.
  if (terms[0].name === terms[1].name) terms[1].name = `${terms[1].name} (earlier)`;

  const courses: DemoCourse[] = [
    {
      id: COURSE_NCM103,
      admin_id: DEAN_ID,
      code: "NCM 103",
      title: "Health Assessment",
      description: "Systematic assessment of the adult client: vital signs, health history and the head-to-toe physical examination, with documentation of findings.",
      created_at: ago(200),
    },
    {
      id: COURSE_NCM112,
      admin_id: DEAN_ID,
      code: "NCM 112",
      title: "Care of Clients with Problems in Oxygenation",
      description: "Nursing care of clients with respiratory problems: pulse oximetry, oxygen delivery, airway management and suctioning.",
      created_at: ago(200),
    },
  ];

  const courseSkills: DemoCourseSkill[] = [
    ...["1-1", "1-4", "1-6", "1-7", "2-1", "2-2", "2-3"].map((skill_id) => ({ course_id: COURSE_NCM103, skill_id, source: "manual" as const })),
    ...["14-1", "14-2", "14-3", "14-4", "14-6"].map((skill_id) => ({ course_id: COURSE_NCM112, skill_id, source: "ai" as const })),
  ];

  const offerings: DemoOffering[] = [
    { id: OFFERING_MAIN, course_id: COURSE_NCM103, term_id: TERM_CURRENT, faculty_id: INSTRUCTOR_ID, section_ids: [SECTION_A, SECTION_B], created_at: ago(58) },
    { id: demoId(KIND.misc, 522), course_id: COURSE_NCM112, term_id: TERM_CURRENT, faculty_id: INSTRUCTOR_2_ID, section_ids: [SECTION_B], created_at: ago(58) },
    { id: demoId(KIND.misc, 523), course_id: COURSE_NCM103, term_id: TERM_PAST, faculty_id: INSTRUCTOR_ID, section_ids: [SECTION_A], created_at: ago(200) },
  ];

  const blank = {
    activity_type: null,
    scenario_id: null,
    assessment_id: null,
    presentation_id: null,
    target_count: null,
    skill_id: null,
    min_score: null,
    skills_only: false,
  };
  const item = (n: number, offering_id: string, position: number, fields: Partial<RequirementRow> & Pick<RequirementRow, "kind">): DemoRequirement => ({
    id: demoId(KIND.misc, 530 + n),
    offering_id,
    position,
    title: "",
    ...blank,
    ...fields,
    created_at: ago(55),
  });

  const requirements: DemoRequirement[] = [
    item(1, OFFERING_MAIN, 0, { kind: "count", activity_type: "scenario", target_count: 3 }),
    item(2, OFFERING_MAIN, 1, { kind: "count", activity_type: "assessment", target_count: 2, min_score: 75 }),
    ...(input.scenarios[0] ? [item(3, OFFERING_MAIN, 2, { kind: "activity", activity_type: "scenario", scenario_id: input.scenarios[0].id })] : []),
    ...(input.casePresentations[0]
      ? [item(4, OFFERING_MAIN, 3, { kind: "activity", activity_type: "case_presentation", presentation_id: input.casePresentations[0].id })]
      : []),
    item(5, OFFERING_MAIN, 4, { kind: "skill", skill_id: "1-7", min_score: 50 }),
    item(6, OFFERING_MAIN, 5, { kind: "count", activity_type: "shift", target_count: 4 }),
    item(7, OFFERING_MAIN, 6, { kind: "manual", title: "Submit the signed return-demonstration sheet" }),
    item(8, demoId(KIND.misc, 523), 0, { kind: "count", activity_type: "scenario", target_count: 2 }),
  ];

  return { terms, courses, courseSkills, offerings, requirements, requirementChecks: [] };
}
