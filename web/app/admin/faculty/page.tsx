import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Instructors | iCARE++",
};

import FacultyClient from "./page-client";

export default function FacultyPage() {
  return <FacultyClient />;
}