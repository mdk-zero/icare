import type { Metadata } from "next";
import FacultyCourseClient from "./page-client";

export const metadata: Metadata = {
  title: "Course | iCARE++ Instructor",
};

export default async function FacultyCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Keyed by course, so switching courses starts each one fresh.
  return <FacultyCourseClient key={id} offeringId={id} />;
}
