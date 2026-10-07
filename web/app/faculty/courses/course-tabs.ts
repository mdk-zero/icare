/** The tabs of a course's page, in order. The URL's ?tab= picks one, so a tab can be linked to and Back returns to it. */
export const COURSE_TABS = ["progress", "requirements", "skills", "grading"] as const;

export type CourseTab = (typeof COURSE_TABS)[number];

export function parseCourseTab(value: unknown): CourseTab {
  return COURSE_TABS.includes(value as CourseTab) ? (value as CourseTab) : "progress";
}

/** A course's page on one of its tabs; Progress, the default, needs no query. */
export function courseTabHref(offeringId: string, tab: CourseTab = "progress"): string {
  return `/faculty/courses/${offeringId}${tab === "progress" ? "" : `?tab=${tab}`}`;
}
