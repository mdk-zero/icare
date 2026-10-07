import { addDays, manilaToday, type RequirementCheckRow, type RequirementRow, type RequirementScoreRow } from "../../course-progress";
import { DEAN_ID, INSTRUCTOR_2_ID, INSTRUCTOR_ID, SECTION_A, SECTION_B, ago, demoId, KIND, type DemoUser } from "./people";
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
export type DemoRequirementScore = RequirementScoreRow;

export const TERM_CURRENT = demoId(KIND.misc, 501);
export const TERM_PAST = demoId(KIND.misc, 502);
export const COURSE_HEALTH_ASSESSMENT = demoId(KIND.misc, 511);
export const COURSE_FUNDAMENTALS = demoId(KIND.misc, 512);
export const OFFERING_MAIN = demoId(KIND.misc, 521);
const OFFERING_FUNDAMENTALS = demoId(KIND.misc, 522);
const OFFERING_COLLEAGUE = demoId(KIND.misc, 524);
const OFFERING_PAST = demoId(KIND.misc, 523);

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
  requirementScores: DemoRequirementScore[];
}

const range = (chapter: number, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${chapter}-${from + i}`);

/**
 * The same two courses and checklists scripts/seed-courses.ts gives the live
 * school. Every item is one each section can meet: the groups work different
 * Patient Cases, so items are skills and counts their work shares, and the
 * Case Presentation is the one given to both sections. Demo quizzes carry no
 * skill links, so quiz counts here take any quiz.
 */
export function seedCourses(input: { users: DemoUser[]; casePresentations: DemoCasePresentation[] }): DemoCourseTables {
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
      id: COURSE_HEALTH_ASSESSMENT,
      admin_id: DEAN_ID,
      code: "NCM 101",
      title: "Health Assessment",
      description:
        "Systematic assessment of the adult client: vital signs and pulse oximetry, the general survey, and the head-to-toe physical examination, with accurate documentation of findings.",
      created_at: ago(200),
    },
    {
      id: COURSE_FUNDAMENTALS,
      admin_id: DEAN_ID,
      code: "NCM 103",
      title: "Fundamentals of Nursing Practice",
      description:
        "Core nursing skills at the bedside: oxygen therapy and airway support, incentive spirometry, and starting, monitoring and maintaining peripheral IV access.",
      created_at: ago(200),
    },
  ];

  const courseSkills: DemoCourseSkill[] = [
    ...[...range(1, 1, 7), ...range(2, 1, 8), "14-1"].map((skill_id) => ({ course_id: COURSE_HEALTH_ASSESSMENT, skill_id, source: "manual" as const })),
    ...[...range(14, 1, 4), ...range(15, 1, 5)].map((skill_id) => ({ course_id: COURSE_FUNDAMENTALS, skill_id, source: "ai" as const })),
  ];

  const offerings: DemoOffering[] = [
    { id: OFFERING_MAIN, course_id: COURSE_HEALTH_ASSESSMENT, term_id: TERM_CURRENT, faculty_id: INSTRUCTOR_ID, section_ids: [SECTION_A, SECTION_B], created_at: ago(58) },
    { id: OFFERING_FUNDAMENTALS, course_id: COURSE_FUNDAMENTALS, term_id: TERM_CURRENT, faculty_id: INSTRUCTOR_ID, section_ids: [SECTION_A, SECTION_B], created_at: ago(58) },
    // A colleague's copy with no checklist yet, so the Dean sees one still to set up.
    { id: OFFERING_COLLEAGUE, course_id: COURSE_FUNDAMENTALS, term_id: TERM_CURRENT, faculty_id: INSTRUCTOR_2_ID, section_ids: [SECTION_B], created_at: ago(58) },
    { id: OFFERING_PAST, course_id: COURSE_HEALTH_ASSESSMENT, term_id: TERM_PAST, faculty_id: INSTRUCTOR_ID, section_ids: [SECTION_A], created_at: ago(200) },
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
    manual_type: "lab" as const,
  };
  let n = 0;
  const checklist = (offering_id: string, items: (Partial<RequirementRow> & Pick<RequirementRow, "kind">)[]): DemoRequirement[] =>
    items.map((fields, position) => ({
      id: demoId(KIND.misc, 530 + ++n),
      offering_id,
      position,
      title: "",
      ...blank,
      ...fields,
      created_at: ago(55),
    }));

  // The Case Presentation every section of the course was given.
  const shared = input.casePresentations.find((p) => [SECTION_A, SECTION_B].every((s) => p.section_ids.includes(s)));

  const requirements: DemoRequirement[] = [
    ...checklist(OFFERING_MAIN, [
      { kind: "count", activity_type: "assessment", target_count: 3, min_score: 75 },
      { kind: "skill", skill_id: "1-1", min_score: 50 },
      { kind: "skill", skill_id: "1-4", min_score: 50 },
      { kind: "skill", skill_id: "1-6", min_score: 50 },
      { kind: "skill", skill_id: "1-7", min_score: 50 },
      // Each group has had four ward duties so far.
      { kind: "count", activity_type: "shift", target_count: 4 },
      { kind: "manual", title: "Head-to-toe assessment return demonstration, signed by the clinical instructor" },
    ]),
    ...checklist(OFFERING_FUNDAMENTALS, [
      { kind: "count", activity_type: "scenario", target_count: 3 },
      { kind: "count", activity_type: "assessment", target_count: 2, min_score: 75 },
      { kind: "skill", skill_id: "14-1", min_score: 50 },
      { kind: "skill", skill_id: "15-3", min_score: 50 },
      ...(shared ? [{ kind: "activity" as const, activity_type: "case_presentation" as const, presentation_id: shared.id }] : []),
      { kind: "manual", title: "Oxygen therapy return demonstration (nasal cannula and face mask)" },
    ]),
    ...checklist(OFFERING_PAST, [{ kind: "count", activity_type: "scenario", target_count: 2 }]),
  ];

  // Return demonstrations already scored: for some of the students doing well,
  // never for one the model calls low performing.
  const doingWell = input.users
    .filter((u) => u.role === "student" && u.team_id && u.risk_level === "safe")
    .sort((a, b) => a.name.localeCompare(b.name));
  let scoreN = 0;
  const signOff = (title: string, share: number): DemoRequirementScore[] => {
    const requirement = requirements.find((r) => r.kind === "manual" && r.title === title);
    if (!requirement) return [];
    return doingWell
      .filter((_, i) => (i * 7) % 10 < share * 10)
      .map((s, i) => ({
        id: demoId(KIND.misc, 600 + ++scoreN),
        requirement_id: requirement.id,
        student_id: s.id,
        score: 78 + ((i * 7) % 20),
        note: "",
        entered_by: INSTRUCTOR_ID,
        entered_at: ago(4 + ((i * 3) % 21), 14, 30),
      }));
  };
  const requirementScores = [
    ...signOff("Head-to-toe assessment return demonstration, signed by the clinical instructor", 0.7),
    ...signOff("Oxygen therapy return demonstration (nasal cannula and face mask)", 0.5),
  ];

  return { terms, courses, courseSkills, offerings, requirements, requirementChecks: [], requirementScores };
}
