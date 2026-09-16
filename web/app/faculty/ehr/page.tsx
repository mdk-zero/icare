import { redirect } from "next/navigation";

/**
 * Folded into Monitoring. Per-note review moved onto the patient chart, which
 * shows every TPR/IVF sheet and progress note for one patient with the same
 * "Mark reviewed" sign-off this page carried.
 */
export default function FacultyEhrPage() {
  redirect("/faculty/monitoring");
}
