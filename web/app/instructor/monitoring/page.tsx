import type { Metadata } from "next";
import RoomsBoard from "../../components/RoomsBoard";

export const metadata: Metadata = {
  title: "Wards | iCARE++ Instructor",
};

/**
 * Wards are rooms only (098): where students perform their patient cases and
 * Return Demonstrations. The patient census that used to be here is hidden;
 * the patients and their charts are kept in the database.
 */
export default function FacultyMonitoringPage() {
  return <RoomsBoard />;
}
