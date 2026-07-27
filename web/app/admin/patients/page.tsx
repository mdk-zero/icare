import type { Metadata } from "next";
import PatientsManager from "../../components/PatientsManager";

export const metadata: Metadata = {
  title: "Patient Records | iCARE++ Admin",
};

/**
 * Same manager the faculty portal uses — /api/faculty/patients already admits
 * admins (isFacultyOrAdmin), so this needed a route and a nav entry, not a
 * parallel implementation.
 */
export default function AdminPatientsPage() {
  return <PatientsManager />;
}
