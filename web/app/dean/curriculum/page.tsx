import type { Metadata } from "next";
import CurriculumClient from "./page-client";

export const metadata: Metadata = {
  title: "Curriculum | iCARE++",
};

export default function CurriculumPage() {
  return <CurriculumClient />;
}
