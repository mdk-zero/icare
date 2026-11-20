import { courseTabHref } from "../instructor/courses/course-tabs";

/** Which web portal a notification is read in; each has its own pages. */
export type NotificationPortal = "instructor" | "dean" | "admin";

export interface NotificationLink {
  href: string;
  label: string;
}

const text = (value: unknown) => (typeof value === "string" && value.length > 0 ? value : null);

/**
 * The page a notification is about, for the "Open …" button on its own page
 * and on its card. Only pages that exist and that the portal's role can open;
 * a kind with nothing to open (an announcement, an account or grade change
 * request, which carry their own Accept and Decline) gets none, and so does
 * anything unknown: never a guessed address.
 */
export function notificationLink(
  data: Record<string, unknown> | undefined,
  portal: NotificationPortal,
): NotificationLink | null {
  if (!data) return null;
  const kind = text(data.kind);

  if (kind === "support_request") {
    const id = text(data.request_id);
    return portal === "admin" && id
      ? { href: `/admin/support?request=${encodeURIComponent(id)}`, label: "Open the support request" }
      : null;
  }
  if (kind === "support_update") {
    return portal === "admin" ? null : { href: `/${portal}/help`, label: "Open Help & Support" };
  }
  if (kind === "access_request" || kind === "grade_edit_request" || kind === "announcement") return null;

  if (portal === "instructor") {
    const offering = text(data.offeringId);
    if (kind === "course" && offering) return { href: courseTabHref(offering), label: "Open the course" };
    if (kind === "grade_edit_decision") {
      const scenario = text(data.scenario_id);
      // Decisions sent before they carried the case go to the list instead.
      return scenario
        ? { href: `/instructor/scenarios/review?case=${encodeURIComponent(scenario)}`, label: "Open Review Submissions" }
        : { href: "/instructor/scenarios", label: "Open Patient Cases" };
    }
    const presentation = text(data.case_presentation_id);
    if (presentation) return { href: `/instructor/cases/${presentation}`, label: "Open the Case Presentation" };
  }

  // Assistance requests, vital signs alerts, risk flags and group moves are about one student.
  const student = text(data.student_id);
  if (student && (portal === "instructor" || portal === "dean")) {
    return { href: `/${portal}/students/${student}`, label: "Open the student's profile" };
  }
  return null;
}
