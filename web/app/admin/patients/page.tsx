import { redirect } from "next/navigation";

/**
 * Folded into Wards, whose census tab renders the same manager. Kept as a
 * redirect rather than deleted: this path is in bookmarks, and the patient
 * chart still lives beneath it at /admin/patients/[id].
 */
export default function AdminPatientsPage() {
  redirect("/admin/wards");
}
