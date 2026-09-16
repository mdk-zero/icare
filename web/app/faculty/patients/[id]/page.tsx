import type { Metadata } from "next";
import PatientChart from "../../../components/PatientChart";

export const metadata: Metadata = {
  title: "Patient Chart | iCARE++ Faculty",
};

export default function FacultyPatientChartPage() {
  return <PatientChart backHref="/faculty/patients" />;
}
