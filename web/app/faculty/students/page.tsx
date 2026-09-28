import { redirect } from "next/navigation";

/** The student list became Students (the groups page); old links and bookmarks land there. */
export default function FacultyStudentsPage() {
  redirect("/faculty/teams");
}
