import type { Metadata } from "next";
import PatientChart from "../../../components/PatientChart";

export const metadata: Metadata = {
  title: "Patient Chart | iCARE++ Faculty",
};

export default function FacultyPatientChartPage() {
  // Back to Monitoring, not /faculty/patients — that path now redirects here.
  return <PatientChart backHref="/faculty/monitoring" backLabel="Monitoring" />;
}
