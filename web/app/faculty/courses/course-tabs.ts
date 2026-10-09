/** The tabs of a course's page, in order. The URL's ?tab= picks one, so a tab can be linked to and Back returns to it. */
export const COURSE_TABS = ["grading", "progress", "performance", "skills"] as const;

export type CourseTab = (typeof COURSE_TABS)[number];

/** The checklist moved into Grading, so links to the old Requirements tab land there. */
export function parseCourseTab(value: unknown): CourseTab {
  if (value === "requirements") return "grading";
  return COURSE_TABS.includes(value as CourseTab) ? (value as CourseTab) : "grading";
}

/** A course's page on one of its tabs; Grading, the default, needs no query. */
export function courseTabHref(offeringId: string, tab: CourseTab = "grading"): string {
  return `/faculty/courses/${offeringId}${tab === "grading" ? "" : `?tab=${tab}`}`;
}
