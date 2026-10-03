import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Courses | iCARE++",
};

import CoursesClient from "./page-client";

export default function CoursesPage() {
  return <CoursesClient />;
}
