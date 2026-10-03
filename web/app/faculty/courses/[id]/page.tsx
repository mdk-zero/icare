import type { Metadata } from "next";
import FacultyCourseClient from "./page-client";

export const metadata: Metadata = {
  title: "Course | iCARE++ Instructor",
};

export default async function FacultyCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <FacultyCourseClient offeringId={id} />;
}
