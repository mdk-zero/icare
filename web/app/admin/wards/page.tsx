import type { Metadata } from "next";
import WardsClient, { WardsTab } from "./page-client";

export const metadata: Metadata = {
  title: "Wards | iCARE++ Admin",
};

/**
 * Patients and Rooms folded into one destination, as the faculty portal's
 * Wards already is. The census tab is the same manager faculty see; the rooms
 * tab keeps what only an admin can do — room records, the floor-plan editor,
 * and student rostering. ?tab=rooms opens the second, so the old /admin/rooms
 * links land where they used to.
 */
export default async function AdminWardsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const initialTab: WardsTab = tab === "rooms" ? "rooms" : "census";
  return <WardsClient initialTab={initialTab} />;
}
