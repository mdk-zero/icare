import { addDays, manilaToday, type RequirementCheckRow, type RequirementRow, type RequirementScoreRow } from "../../course-progress";
import type { GradingSplit } from "../../course-grading";
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
  /** The grading split (067); absent in demos saved before it existed. */
  grading?: GradingSplit | null;
}

export type DemoRequirement = RequirementRow & { created_at: string };
export type DemoRequirementCheck = RequirementCheckRow;
export type DemoRequirementScore = RequirementScoreRow;

export const TERM_CURRENT = demoId(KIND.misc, 501);
export const TERM_PAST = demoId(KIND.misc, 502);
export const COURSE_OLDER_PERSON = demoId(KIND.misc, 511);
export const COURSE_OXYGENATION = demoId(KIND.misc, 512);
export const OFFERING_MAIN = demoId(KIND.misc, 521);
const OFFERING_OXYGENATION = demoId(KIND.misc, 522);
const OFFERING_COLLEAGUE = demoId(KIND.misc, 524);

/** The academic year a date falls in, by its first year: it starts in June. */
function academicYearOf(date: string): number {
  const year = Number(date.slice(0, 4));
  return Number(date.slice(5, 7)) >= 6 ? year : year - 1;
}

export interface DemoCourseTables {
  terms: DemoTerm[];
  courses: DemoCourse[];
  courseSkills: DemoCourseSkill[];
  offerings: DemoOffering[];
  requirements: DemoRequirement[];
  requirementChecks: DemoRequirementCheck[];
  requirementScores: DemoRequirementScore[];
  /** Students an instructor added to a course by hand (073). */
  offeringStudents: { offering_id: string; student_id: string }[];
}

const range = (chapter: number, from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${chapter}-${from + i}`);

/**
 * Two courses the demo curriculum puts in Third Year, First Semester, given to
 * the two third-year sections, so they keep to the course rules
 * (course-rules.ts). The current term is always a first semester, whatever
 * today's date: a semester read off the calendar would put these courses in
 * the wrong one for half the year. Every item is one each section can meet:
 * the groups work different Patient Cases, so items are skills and counts
 * their work shares, and the Case Presentation is the one given to both
 * sections. Demo quizzes carry no skill links, so quiz counts here take any quiz.
 */
export function seedCourses(input: { users: DemoUser[]; casePresentations: DemoCasePresentation[] }): DemoCourseTables {
  const today = manilaToday();
  const currentStart = addDays(today, -60);
  const pastEnd = addDays(currentStart, -21);
  const pastStart = addDays(pastEnd, -125);

  const ay = academicYearOf(currentStart);
  // The semester before, ended, with no course of these sections in it: the
  // year before, they were second-year sections under other names.
  const terms: DemoTerm[] = [
    { id: TERM_CURRENT, admin_id: DEAN_ID, name: `1st Semester AY ${ay}–${ay + 1}`, starts_on: currentStart, ends_on: addDays(today, 75), created_at: ago(70) },
    { id: TERM_PAST, admin_id: DEAN_ID, name: `2nd Semester AY ${ay - 1}–${ay}`, starts_on: pastStart, ends_on: pastEnd, created_at: ago(220) },
  ];

  const courses: DemoCourse[] = [
    {
      id: COURSE_OLDER_PERSON,
      admin_id: DEAN_ID,
      code: "NCM 114L",
      title: "Care of Older Person",
      description:
        "Assessment of the older adult at the bedside: vital signs and pulse oximetry, the general survey, and the head-to-toe physical examination adapted to the older person, with accurate documentation of findings.",
      created_at: ago(200),
    },
    {
      id: COURSE_OXYGENATION,
      admin_id: DEAN_ID,
      code: "NCM 112L",
      title:
        "Care of Clients With Problems in Oxygenation, Fluid and Electrolytes, Infectious, Inflammatory and Immunologic Response, Cellular Aberrations, Acute and Chronic (Skills Lab and RLE)",
      description:
        "Care of clients with problems in oxygenation and fluid balance: oxygen therapy and airway support, incentive spirometry, and starting, monitoring and maintaining peripheral IV access.",
      created_at: ago(200),
    },
  ];

  const courseSkills: DemoCourseSkill[] = [
    ...[...range(1, 1, 7), ...range(2, 1, 8), "14-1"].map((skill_id) => ({ course_id: COURSE_OLDER_PERSON, skill_id, source: "manual" as const })),
    ...[...range(14, 1, 4), ...range(15, 1, 5)].map((skill_id) => ({ course_id: COURSE_OXYGENATION, skill_id, source: "ai" as const })),
  ];

  const offerings: DemoOffering[] = [
    { id: OFFERING_MAIN, course_id: COURSE_OLDER_PERSON, term_id: TERM_CURRENT, faculty_id: INSTRUCTOR_ID, section_ids: [SECTION_A, SECTION_B], created_at: ago(58) },
    { id: OFFERING_OXYGENATION, course_id: COURSE_OXYGENATION, term_id: TERM_CURRENT, faculty_id: INSTRUCTOR_ID, section_ids: [SECTION_A, SECTION_B], created_at: ago(58) },
    // A colleague's copy with no checklist yet, so the Dean sees one still to set up.
    { id: OFFERING_COLLEAGUE, course_id: COURSE_OXYGENATION, term_id: TERM_CURRENT, faculty_id: INSTRUCTOR_2_ID, section_ids: [SECTION_B], created_at: ago(58) },
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
      { kind: "manual", title: "Head-to-toe assessment check-off, signed by the clinical instructor" },
      { kind: "manual", manual_type: "exam", title: "Midterm written exam" },
    ]),
    ...checklist(OFFERING_OXYGENATION, [
      { kind: "count", activity_type: "scenario", target_count: 3 },
      { kind: "count", activity_type: "assessment", target_count: 2, min_score: 75 },
      { kind: "skill", skill_id: "14-1", min_score: 50 },
      { kind: "skill", skill_id: "15-3", min_score: 50 },
      ...(shared ? [{ kind: "activity" as const, activity_type: "case_presentation" as const, presentation_id: shared.id }] : []),
      { kind: "manual", title: "Oxygen therapy check-off (nasal cannula and face mask)" },
      { kind: "manual", manual_type: "exam", title: "Midterm written exam" },
    ]),
  ];

  // Lab check-offs already scored: for some of the students doing well,
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
  // Each course's paper midterm, scored for every student in a group: the
  // ones doing well in the 80s and 90s, the rest lower, so the low
  // performers still sit at the bottom of the Grade column.
  const students = input.users.filter((u) => u.role === "student" && u.team_id).sort((a, b) => a.name.localeCompare(b.name));
  const midterm = (offeringId: string): DemoRequirementScore[] => {
    const exam = requirements.find((r) => r.offering_id === offeringId && r.manual_type === "exam");
    if (!exam) return [];
    return students.map((s, i) => ({
      id: demoId(KIND.misc, 600 + ++scoreN),
      requirement_id: exam.id,
      student_id: s.id,
      score: s.risk_level === "safe" ? 80 + ((i * 7) % 16) : 65 + ((i * 5) % 15),
      note: "",
      entered_by: INSTRUCTOR_ID,
      entered_at: ago(10 + (i % 5), 9, 0),
    }));
  };
  const requirementScores = [
    ...signOff("Head-to-toe assessment check-off, signed by the clinical instructor", 0.7),
    ...signOff("Oxygen therapy check-off (nasal cannula and face mask)", 0.5),
    ...midterm(OFFERING_MAIN),
    ...midterm(OFFERING_OXYGENATION),
  ];

  // Both running courses come graded Written Exams 30 / Laboratory & Skills 70,
  // every item filed.
  let splitN = 0;
  const sid = () => demoId(KIND.misc, 700 + ++splitN);
  const itemIds = (offeringId: string, match: (r: DemoRequirement) => boolean) =>
    requirements.filter((r) => r.offering_id === offeringId && match(r)).map((r) => r.id);
  const exam = (r: DemoRequirement) => r.manual_type === "exam";
  const lab = (r: DemoRequirement) => r.kind === "manual" && r.manual_type === "lab";
  const quizzes = (r: DemoRequirement) => r.kind === "count" && r.activity_type === "assessment";
  const written = (offeringId: string) => ({
    id: sid(),
    name: "Written Exams",
    weight: 30,
    items: [],
    components: [
      { id: sid(), name: "Midterm", weight: 15, items: itemIds(offeringId, exam) },
      { id: sid(), name: "Quizzes", weight: 15, items: itemIds(offeringId, quizzes) },
    ],
  });
  const presentation = itemIds(OFFERING_OXYGENATION, (r) => r.activity_type === "case_presentation");
  const grading: Record<string, GradingSplit> = {
    [OFFERING_MAIN]: {
      parts: [
        written(OFFERING_MAIN),
        {
          id: sid(),
          name: "Laboratory & Skills",
          weight: 70,
          items: [],
          components: [
            { id: sid(), name: "Lab check-offs", weight: 30, items: itemIds(OFFERING_MAIN, lab) },
            { id: sid(), name: "Skill check-offs", weight: 40, items: itemIds(OFFERING_MAIN, (r) => r.kind === "skill") },
          ],
        },
      ],
    },
    [OFFERING_OXYGENATION]: {
      parts: [
        written(OFFERING_OXYGENATION),
        {
          id: sid(),
          name: "Laboratory & Skills",
          weight: 70,
          items: [],
          components: [
            { id: sid(), name: "Lab reports", weight: 20, items: itemIds(OFFERING_OXYGENATION, lab) },
            {
              id: sid(),
              name: "Individual performance",
              weight: presentation.length ? 30 : 50,
              items: itemIds(OFFERING_OXYGENATION, (r) => r.kind === "skill" || (r.kind === "count" && r.activity_type === "scenario")),
            },
            ...(presentation.length ? [{ id: sid(), name: "Case presentation", weight: 20, items: presentation }] : []),
          ],
        },
      ],
    },
  };
  for (const o of offerings) o.grading = grading[o.id] ?? null;

  return { terms, courses, courseSkills, offerings, requirements, requirementChecks: [], requirementScores, offeringStudents: [] };
}
