import type { Metadata } from "next";
import FacultyEhrClient from "./page-client";

export const metadata: Metadata = {
  title: "EHR Review | iCARE++ Faculty",
};

export default function FacultyEhrPage() {
  return <FacultyEhrClient />;
}
