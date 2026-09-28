import { redirect } from "next/navigation";

/** Folded into Wards, which arranges and manages rooms; kept for bookmarks. */
export default function RoomsPage() {
  redirect("/admin/wards");
}
