import { redirect } from "next/navigation";

/**
 * Folded into Wards, whose census tab renders the same manager. Kept as a
 * redirect rather than deleted: this path is in bookmarks.
 */
export default function AdminPatientsPage() {
  redirect("/dean/wards");
}
