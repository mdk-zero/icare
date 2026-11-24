import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Faculty | iCARE++",
};

import FacultyClient from "./page-client";

export default function FacultyPage() {
  return <FacultyClient />;
}