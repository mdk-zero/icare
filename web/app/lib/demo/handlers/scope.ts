import type { DemoRole } from "../session";
import type { DemoDb } from "../store";
import type { DemoUser } from "../fixtures/people";

/**
 * Who sees what, mirroring lib/roster.ts and lib/admin-scope.ts: an
 * Instructor sees the groups they supervise, those groups' sections and
 * members, and the rest of their course rosters; the Dean sees the whole
 * (demo) school.
 */

export function ownTeams(db: DemoDb, role: DemoRole, viewerId: string) {
  return role === "faculty" ? db.teams.filter((t) => t.faculty_id === viewerId) : db.teams;
}

export function visibleSections(db: DemoDb, role: DemoRole, viewerId: string) {
  if (role !== "faculty") return [...db.sections].sort((a, b) => a.name.localeCompare(b.name));
  const ids = new Set(ownTeams(db, role, viewerId).map((t) => t.section_id));
  return db.sections.filter((s) => ids.has(s.id)).sort((a, b) => a.name.localeCompare(b.name));
}

export function students(db: DemoDb): DemoUser[] {
  return db.users.filter((u) => u.role === "student");
}

export function visibleStudents(db: DemoDb, role: DemoRole, viewerId: string): DemoUser[] {
  if (role !== "faculty") return students(db).sort(byName);
  const own = ownTeams(db, role, viewerId);
  const teams = new Set(own.map((t) => t.id));
  // Course rosters too, as lib/roster.ts: a course section with no group of theirs, and students added by hand.
  const course = db as {
    offerings?: { id: string; faculty_id: string | null; section_ids: string[] }[];
    offeringStudents?: { offering_id: string; student_id: string }[];
  };
  const mine = (course.offerings ?? []).filter((o) => o.faculty_id === viewerId);
  const grouped = new Set(own.map((t) => t.section_id));
  const wholeSections = new Set(mine.flatMap((o) => o.section_ids).filter((id) => !grouped.has(id)));
  const offeringIds = new Set(mine.map((o) => o.id));
  const added = new Set((course.offeringStudents ?? []).filter((r) => offeringIds.has(r.offering_id)).map((r) => r.student_id));
  return students(db)
    .filter(
      (s) =>
        (s.team_id && teams.has(s.team_id)) || (s.section_id && wholeSections.has(s.section_id)) || added.has(s.id),
    )
    .sort(byName);
}

export function canSeeStudent(db: DemoDb, role: DemoRole, viewerId: string, studentId: string) {
  return visibleStudents(db, role, viewerId).some((s) => s.id === studentId);
}

export function byName(a: { name: string }, b: { name: string }) {
  return a.name.localeCompare(b.name, undefined, { numeric: true });
}

export function userById(db: DemoDb, id: string | null | undefined): DemoUser | undefined {
  return id ? db.users.find((u) => u.id === id) : undefined;
}

export function sectionName(db: DemoDb, id: string | null | undefined): string | null {
  return db.sections.find((s) => s.id === id)?.name ?? null;
}

/** "BSN 3101 · Group A": group names repeat across sections. */
export function teamLabel(db: DemoDb, teamId: string | null | undefined): string | null {
  const team = db.teams.find((t) => t.id === teamId);
  if (!team) return null;
  return `${sectionName(db, team.section_id) ?? "—"} · ${team.name}`;
}

export function memberInfo(u: DemoUser) {
  return { id: u.id, name: u.name, picture_url: u.picture_url, sex: u.sex };
}
