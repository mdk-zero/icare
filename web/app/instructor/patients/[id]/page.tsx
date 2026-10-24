import type { Metadata } from "next";
import PatientChart from "../../../components/PatientChart";

export const metadata: Metadata = {
  title: "Patient Chart | iCARE++ Instructor",
};

export default function FacultyPatientChartPage() {
  // Back to Monitoring, not /instructor/patients — that path now redirects here.
  return <PatientChart backHref="/instructor/monitoring" backLabel="Monitoring" />;
}
