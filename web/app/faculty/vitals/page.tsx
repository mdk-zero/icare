import type { Metadata } from "next";
import FacultyVitalsClient from "./page-client";

export const metadata: Metadata = {
  title: "Vitals Monitor | iCARE++ Faculty",
};

export default function FacultyVitalsPage() {
  return <FacultyVitalsClient />;
}
