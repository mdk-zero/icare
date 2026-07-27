import type { Metadata } from "next";
import PatientsManager from "../../components/PatientsManager";

export const metadata: Metadata = {
  title: "Patient Records | iCARE++ Faculty",
};

export default function FacultyPatientsPage() {
  return <PatientsManager />;
}