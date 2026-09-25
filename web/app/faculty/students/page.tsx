import { redirect } from "next/navigation";

/** The student list became My Groups; old links and bookmarks land there. */
export default function FacultyStudentsPage() {
  redirect("/faculty/teams");
}
