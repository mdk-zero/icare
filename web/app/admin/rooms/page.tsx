import { redirect } from "next/navigation";

/** Folded into Wards as its Rooms tab; kept as a redirect for bookmarks. */
export default function RoomsPage() {
  redirect("/admin/wards?tab=rooms");
}
