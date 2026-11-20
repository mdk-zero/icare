import { redirect } from "next/navigation";

/**
 * Folded into Wards → Rooms & layout, which has the census. Kept as a
 * redirect rather than deleted: this path is in bookmarks.
 */
export default function AdminPatientsPage() {
  redirect("/dean/wards/layout");
}
