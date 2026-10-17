import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Assign Course | iCARE++",
};

import AssignCourseClient from "./page-client";

export default function AssignCoursePage() {
  return <AssignCourseClient />;
}
