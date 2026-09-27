import type { Metadata } from "next";
import FacultyCasesClient from "./page-client";

export const metadata: Metadata = {
  title: "Case Presentations | iCARE++ Faculty",
};

export default function FacultyCasesPage() {
  return <FacultyCasesClient />;
}
