/**
 * The Students pages keep the open course, section and mode in the URL, and
 * note that URL here, so "Back to Students" on a profile lands on the same
 * roster instead of the top of the page. Per tab and best effort: with
 * storage blocked, Back goes to the top as before.
 */

export type StudentsViewRole = "dean" | "instructor";

export const STUDENTS_PATH: Record<StudentsViewRole, string> = {
  dean: "/dean/student-management",
  instructor: "/instructor/teams",
};

const key = (role: StudentsViewRole) => `icare:students-view:${role}`;

export function rememberStudentsView(role: StudentsViewRole, href: string) {
  try {
    sessionStorage.setItem(key(role), href);
  } catch {
    // Storage blocked: Back goes to the top of the page.
  }
}

/** Where "Back to Students" goes: the last roster open in this tab, or the page itself. */
export function studentsViewHref(role: StudentsViewRole): string {
  const path = STUDENTS_PATH[role];
  try {
    const href = sessionStorage.getItem(key(role));
    if (href === path || href?.startsWith(`${path}?`)) return href;
  } catch {
    // Storage blocked: fall through to the page itself.
  }
  return path;
}

/** The Students page's URL for a course, section and mode. */
export function studentsHref(
  role: StudentsViewRole,
  view: { course?: string | null; section?: string | null; editing?: boolean },
): string {
  const params = new URLSearchParams();
  if (view.course) params.set("course", view.course);
  if (view.section) params.set("section", view.section);
  if (view.section && view.editing) params.set("view", "groups");
  const query = params.toString();
  return query ? `${STUDENTS_PATH[role]}?${query}` : STUDENTS_PATH[role];
}
