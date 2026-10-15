import type { Parsed } from './course-progress';
import type { FacultyTeam, TeamsOverview } from './api';

/**
 * The rules of a Return Demonstration (migration 072): a scenario with no
 * patient, made of one or more Taylor's skills whose checklist steps the
 * student demonstrates and the instructor grades on the Patient Case scale.
 *
 * Pure, so the API routes, the instructor pages and the demo share it.
 */

export const RETURN_DEMO_CATEGORY = 'Return Demonstration';
export const MAX_RETURN_DEMO_TITLE = 200;

/** A Taylor's skill picked for a scenario, and which of its variants. */
export interface SkillSelection {
  skillId: string;
  /** Variant headings to include; omitted means the skill's defaults. */
  sections?: string[];
}

/** Selections from a request body; unknown shapes are dropped. */
export function parseSkillSelections(value: unknown): SkillSelection[] {
  if (!Array.isArray(value)) return [];
  const out: SkillSelection[] = [];
  for (const item of value) {
    if (typeof item === 'string') out.push({ skillId: item });
    else if (item && typeof item === 'object' && typeof (item as { id?: unknown }).id === 'string') {
      const sections = (item as { sections?: unknown }).sections;
      out.push({
        skillId: (item as { id: string }).id,
        sections: Array.isArray(sections) ? sections.filter((x): x is string => typeof x === 'string') : undefined,
      });
    }
  }
  return out;
}

export interface ReturnDemoInput {
  title: string;
  description: string;
  offering_id: string | null;
  skills: SkillSelection[];
}

/**
 * A create (every field, title and a skill required) or, with `partial`, an
 * edit carrying only the fields the body names. Skills keep their first
 * mention, in order.
 */
export function parseReturnDemoInput(body: unknown, opts: { partial?: boolean } = {}): Parsed<Partial<ReturnDemoInput>> {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  const has = (key: string) => !opts.partial || key in b;
  const value: Partial<ReturnDemoInput> = {};

  if (has('title')) {
    const title = typeof b.title === 'string' ? b.title.trim() : '';
    if (!title) return { ok: false, error: 'Title is required' };
    if (title.length > MAX_RETURN_DEMO_TITLE) return { ok: false, error: `Keep the title under ${MAX_RETURN_DEMO_TITLE} characters` };
    value.title = title;
  }
  if (has('description')) value.description = typeof b.description === 'string' ? b.description.trim() : '';
  if (has('offering_id')) value.offering_id = typeof b.offering_id === 'string' && b.offering_id.trim() ? b.offering_id.trim() : null;
  if (has('skills')) {
    const seen = new Set<string>();
    const skills = parseSkillSelections(b.skills).filter((s) => !seen.has(s.skillId) && seen.add(s.skillId));
    if (skills.length === 0) return { ok: false, error: 'Pick at least one skill' };
    value.skills = skills;
  }
  return { ok: true, value };
}

/**
 * Who an assignment reaches: every member of the chosen groups, tagged with
 * that group, then each student picked by name, tagged with their own group
 * (or none). A student reached twice is assigned once; one who already has
 * it is skipped and counted.
 */
export function mergeAssignees(input: {
  teamMembers: ReadonlyMap<string, readonly string[]>;
  studentIds: readonly string[];
  teamOf: ReadonlyMap<string, string>;
  already: ReadonlySet<string>;
}): { rows: { student_id: string; team_id: string | null }[]; skipped: number } {
  const rows: { student_id: string; team_id: string | null }[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  const add = (studentId: string, teamId: string | null) => {
    if (seen.has(studentId)) return;
    seen.add(studentId);
    if (input.already.has(studentId)) skipped += 1;
    else rows.push({ student_id: studentId, team_id: teamId });
  };
  for (const [teamId, members] of input.teamMembers) for (const id of members) add(id, teamId);
  for (const id of input.studentIds) add(id, input.teamOf.get(id) ?? null);
  return { rows, skipped };
}

/**
 * An edit's skill changes against the tasks it has: skills to add, ungraded
 * tasks to remove, and the titles of graded tasks the edit would drop, which
 * are refused rather than removed (their grades would go with them).
 */
export function skillDiff(
  current: readonly { id: string; skill_id: string | null; title: string }[],
  wanted: readonly SkillSelection[],
  graded: ReadonlySet<string>,
): { add: SkillSelection[]; remove: string[]; blocked: string[] } {
  const have = new Set(current.map((t) => t.skill_id).filter((id): id is string => !!id));
  const want = new Set(wanted.map((s) => s.skillId));
  const dropped = current.filter((t) => !t.skill_id || !want.has(t.skill_id));
  return {
    add: wanted.filter((s) => !have.has(s.skillId)),
    remove: dropped.filter((t) => !graded.has(t.id)).map((t) => t.id),
    blocked: dropped.filter((t) => graded.has(t.id)).map((t) => t.title),
  };
}

/**
 * Whether a viewer may see a Return Demonstration. Unlike a Patient Case, an
 * unassigned one is not shared material: it belongs to its maker until it is
 * given out, so another instructor can't take it over. An instructor whose
 * students hold it sees it (they grade them); an admin sees every one.
 */
export function returnDemoVisibleTo(
  demo: { created_by: string | null },
  assignedStudentIds: readonly string[],
  viewer: { uid: string; role: string },
  roster: ReadonlySet<string>,
): boolean {
  if (viewer.role === 'admin' || demo.created_by === viewer.uid) return true;
  return assignedStudentIds.some((id) => roster.has(id));
}

/**
 * Who an instructor can give one to: the groups they supervise and those
 * groups' members. Students in no group show on their Students page but are
 * not on their roster, so the assign route would refuse them.
 */
export function assignableStudents(overview: Pick<TeamsOverview, 'viewer_id' | 'teams' | 'students'>): {
  teams: FacultyTeam[];
  students: TeamsOverview['students'];
} {
  const teams = overview.teams.filter((t) => t.faculty_id === overview.viewer_id);
  const own = new Set(teams.map((t) => t.id));
  return { teams, students: overview.students.filter((s) => s.team_id !== null && own.has(s.team_id)) };
}
