import { redirect } from "next/navigation";

/**
 * Folded into Monitoring, which renders the same census above the room layout.
 * Kept as a redirect rather than deleted: this path is in bookmarks, and the
 * patient chart still lives beneath it at /faculty/patients/[id].
 */
export default function FacultyPatientsPage() {
  redirect("/faculty/monitoring");
}
