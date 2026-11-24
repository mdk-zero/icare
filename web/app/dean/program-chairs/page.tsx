import { redirect } from "next/navigation";

/** Program Chairs are managed on the Faculty page now, beside the instructors. */
export default function ProgramChairsPage() {
  redirect("/dean/instructors");
}
