import { redirect } from "next/navigation";

/**
 * The Shifts page is gone: attendance now comes from each RetDem, Quiz and
 * Case Presentation's deadline, on the student's profile and in reports.
 * Kept as a redirect rather than deleted: this path is in bookmarks.
 */
export default function FacultyAttendancePage() {
  redirect("/faculty");
}
