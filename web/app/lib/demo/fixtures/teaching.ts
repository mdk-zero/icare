import suggestions from "@/scripts/data/library-suggestions.json";
import { CASE_CRITERIA, caseScore, type CaseLevel } from "@/app/lib/case-rubric";
import {
  DEAN_ID,
  INSTRUCTOR_2_ID,
  INSTRUCTOR_3_ID,
  INSTRUCTOR_ID,
  KIND,
  SECTION_A,
  SECTION_B,
  TEAM_A1,
  TEAM_A2,
  TEAM_B1,
  TEAM_B2,
  ago,
  ahead,
  demoId,
  type DemoTeam,
  type DemoUser,
} from "./people";

/** Case presentations reported by groups, and the Library's materials. */

export interface DemoCasePresentation {
  /** The groups it was given to (075). */
  team_ids?: string[];
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

/** A member's own record of a group's case presentation, carrying the group's status and grade. */
export interface DemoCaseSubmission {
  id: string;
  presentation_id: string;
  student_id: string;
  group_id: string | null;
  status: "not_started" | "draft" | "submitted" | "graded";
  submitted_at: string | null;
  graded_at: string | null;
  graded_by: string | null;
  score: number | null;
  remarks: string;
  updated_at: string;
}

/** A group reporting a case presentation (093): its leader, slides and grade. */
export interface DemoCaseGroup {
  id: string;
  presentation_id: string;
  team_id: string | null;
  team_name: string;
  section_name: string;
  leader_id: string | null;
  status: "not_started" | "draft" | "submitted" | "graded";
  file: { name: string; size: number; type: "pdf" | "pptx"; uploaded_by: string } | null;
  submitted_at: string | null;
  score: number | null;
  remarks: string;
  graded_by: string | null;
  graded_at: string | null;
  ratings: { criterion: string; level: CaseLevel; remarks: string }[];
}

export interface DemoMaterial {
  id: string;
  /** The course it is for (075); null for none, undefined until linked. */
  offering_id?: string | null;
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

export function seedTeaching(users: DemoUser[], teams: DemoTeam[]) {
  const presentations: DemoCasePresentation[] = [
    {
      id: demoId(KIND.casePresentation, 1),
      title: "Case Presentation 1: A patient from your first ward week",
      instructions:
        "Choose one patient you cared for during your first ward week. Present them with initials only — no names, birthdays or hospital numbers. Cover the profile, your assessment findings, two prioritised nursing diagnoses and the care you gave.",
      deadline: ago(9, 23, 59),
      section_ids: [SECTION_A],
      team_ids: [TEAM_A1, TEAM_A2],
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
      team_ids: [TEAM_A1, TEAM_A2, TEAM_B1, TEAM_B2],
      created_by: INSTRUCTOR_ID,
      created_at: ago(3),
      updated_at: ago(3),
    },
  ];

  // Who reports what: the first presentation is done (one group graded, one
  // waiting); the second is under way.
  const PLAN: Record<string, Record<string, { status: DemoCaseGroup["status"]; levels?: CaseLevel[]; file?: string }>> = {
    [presentations[0].id]: {
      [TEAM_A1]: { status: "graded", levels: [4, 3, 3, 4, 3, 3], file: "Group A - Case Presentation (Pneumonia).pptx" },
      [TEAM_A2]: { status: "submitted", file: "Group B - Acute Gastroenteritis Case.pdf" },
    },
    [presentations[1].id]: {
      [TEAM_A1]: { status: "submitted", file: "Group A - Fluid Balance Case.pptx" },
      [TEAM_A2]: { status: "not_started" },
      [TEAM_B1]: { status: "not_started" },
      [TEAM_B2]: { status: "submitted", file: "Group B - IV Therapy Case.pdf" },
    },
  };
  const SECTION_NAME: Record<string, string> = { [SECTION_A]: "BSN 3101", [SECTION_B]: "BSN 3102" };

  const students = users.filter((u) => u.role === "student");
  const groups: DemoCaseGroup[] = [];
  const submissions: DemoCaseSubmission[] = [];
  let n = 0;
  for (const p of presentations) {
    for (const teamId of p.team_ids ?? []) {
      const team = teams.find((t) => t.id === teamId);
      const plan = PLAN[p.id]?.[teamId];
      if (!team || !plan) continue;
      const members = students.filter((u) => u.team_id === teamId).sort((x, y) => x.name.localeCompare(y.name));
      if (members.length === 0) continue;
      n += 1;
      const leader = members[0];
      const first = p === presentations[0];
      const handedIn = plan.status === "submitted" || plan.status === "graded";
      const submittedAt = handedIn ? (first ? ago(10 - (n % 2) * 0.5, 21) : ago(1 + (n % 2), 20)) : null;
      const ratings = (plan.levels ?? []).map((level, k) => ({
        criterion: CASE_CRITERIA[k].key,
        level,
        remarks: CASE_CRITERIA[k].key === "care_plan" ? "Put airway and breathing problems first in the NCP." : "",
      }));
      const score = plan.status === "graded" ? caseScore(new Map(ratings.map((r) => [r.criterion, r.level]))) : null;
      const remarks = plan.status === "graded" ? "Clear pathophysiology diagram; strengthen the prioritisation in the NCP." : "";
      const group: DemoCaseGroup = {
        id: demoId(KIND.misc, 950 + n),
        presentation_id: p.id,
        team_id: teamId,
        team_name: team.name,
        section_name: SECTION_NAME[team.section_id] ?? "",
        leader_id: leader.id,
        status: plan.status,
        file: plan.file
          ? {
              name: plan.file,
              size: 4_200_000 + n * 730_000,
              type: plan.file.endsWith(".pdf") ? "pdf" : "pptx",
              uploaded_by: leader.id,
            }
          : null,
        submitted_at: submittedAt,
        score,
        remarks,
        graded_by: plan.status === "graded" ? INSTRUCTOR_ID : null,
        graded_at: plan.status === "graded" ? ago(7, 15) : null,
        ratings,
      };
      groups.push(group);
      for (const m of members) {
        submissions.push({
          id: demoId(KIND.caseSubmission, submissions.length + 1),
          presentation_id: p.id,
          student_id: m.id,
          group_id: group.id,
          status: plan.status,
          submitted_at: submittedAt,
          graded_at: group.graded_at,
          graded_by: group.graded_by,
          score,
          remarks,
          updated_at: submittedAt ?? ago(2),
        });
      }
    }
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

  return { casePresentations: presentations, caseSubmissions: submissions, caseGroups: groups, materials };
}
