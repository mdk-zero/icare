/**
 * The demo's people: one Admin, one Dean, three Instructors and a cohort of
 * twenty students in two sections of two groups each. Everyone is fictional.
 *
 * Ids are fixed, UUID-shaped strings so links survive a refresh and any code
 * that expects a UUID is satisfied. Dates are computed when the demo starts,
 * so the data always reads as current.
 */

export type Sex = "male" | "female";
export type DemoRoleName = "super_admin" | "admin" | "faculty" | "student";

export interface DemoUser {
  id: string;
  email: string;
  name: string;
  role: DemoRoleName;
  sex: Sex | null;
  picture_url: string | null;
  /** Students: their section. */
  section_id: string | null;
  /** Students: their group. */
  team_id: string | null;
  /** Instructors: the dean who owns them. */
  admin_id: string | null;
  student_number: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  /** Students: last time they did anything in the app. */
  last_activity: string | null;
  status: "active" | "disabled";
  google_linked: boolean;
  /** Students: the ML model's latest call. */
  risk_level: "safe" | "at_risk" | null;
  risk_probability: number | null;
}

export interface DemoSection {
  id: string;
  name: string;
  year_level: number;
  /** Instructors given the whole section on the Dean's Sections page. */
  faculty_ids: string[];
  created_at: string;
}

export interface DemoTeam {
  id: string;
  section_id: string;
  name: string;
  faculty_id: string | null;
  created_at: string;
}

/** `d0000003-0000-4000-8000-000000000012`: a readable, valid v4-shaped id. */
export function demoId(kind: number, n: number): string {
  return `d${String(kind).padStart(7, "0")}-0000-4000-8000-${String(n).padStart(12, "0")}`;
}

export const KIND = {
  user: 1,
  section: 2,
  team: 3,
  scenario: 4,
  assignment: 5,
  task: 6,
  quiz: 7,
  question: 8,
  attempt: 9,
  shift: 10,
  room: 11,
  patient: 12,
  notification: 13,
  audit: 14,
  material: 15,
  casePresentation: 16,
  caseSubmission: 17,
  misc: 18,
  criteria: 19,
  vitals: 20,
  ehr: 21,
  reflection: 22,
  testRun: 23,
} as const;

const DAY = 86_400_000;

/** An ISO time `days` ago (fractional days fine), at an optional hour of that day. */
export function ago(days: number, hour?: number, minute = 0): string {
  const d = new Date(Date.now() - days * DAY);
  if (hour !== undefined) d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** An ISO time `days` ahead. */
export function ahead(days: number, hour?: number, minute = 0): string {
  return ago(-days, hour, minute);
}

export const ADMIN_ID = demoId(KIND.user, 1);
export const DEAN_ID = demoId(KIND.user, 2);
export const INSTRUCTOR_ID = demoId(KIND.user, 3);
export const INSTRUCTOR_2_ID = demoId(KIND.user, 4);
export const INSTRUCTOR_3_ID = demoId(KIND.user, 5);

export const SECTION_A = demoId(KIND.section, 1);
export const SECTION_B = demoId(KIND.section, 2);

export const TEAM_A1 = demoId(KIND.team, 1);
export const TEAM_A2 = demoId(KIND.team, 2);
export const TEAM_B1 = demoId(KIND.team, 3);
export const TEAM_B2 = demoId(KIND.team, 4);

function staff(
  id: string,
  name: string,
  email: string,
  role: DemoRoleName,
  sex: Sex,
  adminId: string | null = null,
): DemoUser {
  return {
    id,
    email,
    name,
    role,
    sex,
    picture_url: null,
    section_id: null,
    team_id: null,
    admin_id: adminId,
    student_number: null,
    created_at: ago(240),
    last_sign_in_at: ago(0.05),
    last_activity: ago(0.05),
    status: "active",
    google_linked: false,
    risk_level: null,
    risk_probability: null,
  };
}

/** [name, sex, section, team, risk, probability, last active (days ago)] */
const STUDENTS: [string, Sex, string, string, "safe" | "at_risk", number, number][] = [
  ["Angela Bautista", "female", SECTION_A, TEAM_A1, "safe", 0.08, 0.1],
  ["Mark Anthony Cruz", "male", SECTION_A, TEAM_A1, "at_risk", 0.71, 3.2],
  ["Kristine Dela Peña", "female", SECTION_A, TEAM_A1, "safe", 0.12, 0.3],
  ["Joshua Mendoza", "male", SECTION_A, TEAM_A1, "safe", 0.21, 0.8],
  ["Patricia Lim", "female", SECTION_A, TEAM_A1, "safe", 0.05, 0.2],
  ["Bea Ramirez", "female", SECTION_A, TEAM_A2, "safe", 0.17, 0.4],
  ["Carlo Navarro", "male", SECTION_A, TEAM_A2, "at_risk", 0.64, 5.1],
  ["Denise Aquino", "female", SECTION_A, TEAM_A2, "safe", 0.09, 0.1],
  ["Rafael Tan", "male", SECTION_A, TEAM_A2, "safe", 0.26, 1.4],
  ["Sofia Gonzales", "female", SECTION_A, TEAM_A2, "safe", 0.14, 0.6],
  ["Isabel Torres", "female", SECTION_B, TEAM_B1, "safe", 0.11, 0.2],
  ["Miguel Santiago", "male", SECTION_B, TEAM_B1, "safe", 0.19, 0.9],
  ["Hannah Villareal", "female", SECTION_B, TEAM_B1, "at_risk", 0.58, 2.7],
  ["Nathaniel Ocampo", "male", SECTION_B, TEAM_B1, "safe", 0.23, 0.5],
  ["Camille Robles", "female", SECTION_B, TEAM_B1, "safe", 0.07, 0.1],
  ["Gabriel Domingo", "male", SECTION_B, TEAM_B2, "safe", 0.15, 0.3],
  ["Erika Manalo", "female", SECTION_B, TEAM_B2, "safe", 0.1, 1.1],
  ["Paolo Garcia", "male", SECTION_B, TEAM_B2, "safe", 0.3, 0.7],
  ["Jasmine Castro", "female", SECTION_B, TEAM_B2, "safe", 0.06, 0.2],
  ["Vincent Salazar", "male", SECTION_B, TEAM_B2, "at_risk", 0.67, 4.3],
];

export const FIRST_STUDENT_N = 101;

export function seedPeople(): { users: DemoUser[]; sections: DemoSection[]; teams: DemoTeam[] } {
  const users: DemoUser[] = [
    staff(ADMIN_ID, "Andrea Villanueva", "admin@demo.icare.ph", "super_admin", "female"),
    staff(DEAN_ID, "Ramon Castillo", "dean@demo.icare.ph", "admin", "male"),
    staff(INSTRUCTOR_ID, "Maria Santos", "maria.santos@demo.icare.ph", "faculty", "female", DEAN_ID),
    staff(INSTRUCTOR_2_ID, "Jose Reyes", "jose.reyes@demo.icare.ph", "faculty", "male", DEAN_ID),
    staff(INSTRUCTOR_3_ID, "Liza Fernandez", "liza.fernandez@demo.icare.ph", "faculty", "female", DEAN_ID),
  ];
  users[3].last_sign_in_at = ago(1.2);
  users[4].last_sign_in_at = ago(3.5);

  STUDENTS.forEach(([name, sex, section, team, risk, probability, active], i) => {
    const n = FIRST_STUDENT_N + i;
    const [first, ...rest] = name.toLowerCase().split(" ");
    const last = rest[rest.length - 1].replace("ñ", "n");
    users.push({
      id: demoId(KIND.user, n),
      email: `${first}.${last}@student.demo.icare.ph`,
      name,
      role: "student",
      sex,
      picture_url: null,
      section_id: section,
      team_id: team,
      admin_id: null,
      student_number: `2023-${String(10400 + i * 37).padStart(5, "0")}`,
      created_at: ago(200),
      last_sign_in_at: ago(active),
      last_activity: ago(active),
      status: "active",
      google_linked: false,
      risk_level: risk,
      risk_probability: probability,
    });
  });

  const sections: DemoSection[] = [
    { id: SECTION_A, name: "BSN 3101", year_level: 3, faculty_ids: [INSTRUCTOR_ID], created_at: ago(220) },
    { id: SECTION_B, name: "BSN 3102", year_level: 3, faculty_ids: [INSTRUCTOR_2_ID], created_at: ago(220) },
  ];

  // The demo Instructor supervises both groups of BSN 3101 and one of BSN
  // 3102, so their pages show two sections; the other group is a colleague's.
  const teams: DemoTeam[] = [
    { id: TEAM_A1, section_id: SECTION_A, name: "Group A", faculty_id: INSTRUCTOR_ID, created_at: ago(180) },
    { id: TEAM_A2, section_id: SECTION_A, name: "Group B", faculty_id: INSTRUCTOR_ID, created_at: ago(180) },
    { id: TEAM_B1, section_id: SECTION_B, name: "Group A", faculty_id: INSTRUCTOR_ID, created_at: ago(180) },
    { id: TEAM_B2, section_id: SECTION_B, name: "Group B", faculty_id: INSTRUCTOR_2_ID, created_at: ago(180) },
  ];

  return { users, sections, teams };
}

/** The account each demo role signs in as. */
export const DEMO_VIEWERS = {
  super_admin: ADMIN_ID,
  admin: DEAN_ID,
  faculty: INSTRUCTOR_ID,
} as const;
