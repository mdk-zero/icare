import type { Metadata } from "next";
import PatientChart from "../../../components/PatientChart";

export const metadata: Metadata = {
  title: "Patient Chart | iCARE++ Admin",
};

export default function AdminPatientChartPage() {
  return <PatientChart backHref="/admin/patients" />;
}
