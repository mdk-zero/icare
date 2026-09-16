import { redirect } from "next/navigation";

/**
 * Folded into Monitoring. This page grouped readings by patient; a patient's
 * chart now carries the same readings alongside their TPR/IVF and notes, so
 * the census is the way in rather than a parallel list.
 */
export default function FacultyVitalsPage() {
  redirect("/faculty/monitoring");
}
