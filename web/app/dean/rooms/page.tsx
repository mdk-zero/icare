import { redirect } from "next/navigation";

/** Folded into Wards → Rooms & layout, which arranges and manages rooms; kept for bookmarks. */
export default function RoomsPage() {
  redirect("/dean/wards/layout");
}
