import type { Metadata } from "next";
import FacultyCoursesClient from "./page-client";

export const metadata: Metadata = {
  title: "Courses | iCARE++ Instructor",
};

export default function FacultyCoursesPage() {
  return <FacultyCoursesClient />;
}
