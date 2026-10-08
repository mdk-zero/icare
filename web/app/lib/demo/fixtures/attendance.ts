import type { ExcuseFact } from "@/app/lib/attendance";
import { ago, demoId, INSTRUCTOR_ID, KIND, type DemoTeam, type DemoUser } from "./people";
import type { DemoAssignment, DemoCompletion } from "./school";

/** An instructor excusing an absence (activity_excuses, migration 068). */
export type DemoExcuse = ExcuseFact & { id: string };

/**
 * One excused absence, so the profile's Attendance tab has one to show: the
 * latest RetDem a member of the demo instructor's first group never did by
 * its deadline.
 */
export function seedExcuses(
  users: DemoUser[],
  teams: DemoTeam[],
  assignments: DemoAssignment[],
  completions: DemoCompletion[],
): DemoExcuse[] {
  const team = teams.filter((t) => t.faculty_id === INSTRUCTOR_ID).sort((a, b) => a.name.localeCompare(b.name))[0];
  if (!team) return [];
  const members = new Set(users.filter((u) => u.role === "student" && u.team_id === team.id).map((u) => u.id));
  const graded = new Set(completions.map((c) => c.assignment_id));
  const now = Date.now();
  const missed = assignments
    .filter((a) => members.has(a.student_id) && !graded.has(a.id) && Date.parse(a.deadline) < now)
    .sort((a, b) => Date.parse(b.deadline) - Date.parse(a.deadline))[0];
  if (!missed) return [];
  return [
    {
      id: demoId(KIND.misc, 3000),
      student_id: missed.student_id,
      kind: "scenario",
      activity_id: missed.id,
      reason: "Medical certificate submitted.",
      excused_by_name: users.find((u) => u.id === INSTRUCTOR_ID)?.name ?? null,
      created_at: ago(1, 9),
    },
  ];
}
