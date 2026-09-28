import type { Metadata } from "next";
import PatientsManager from "../../components/PatientsManager";

export const metadata: Metadata = {
  title: "Wards | iCARE++ Admin",
};

/**
 * The faculty Wards page, plus what only an admin can do: arrange the room
 * layout and manage the rooms themselves. Patients and Rooms used to be two
 * sidebar entries; both routes now redirect here.
 */
export default function AdminWardsPage() {
  return (
    <PatientsManager
      badgeLabel="Ward Management"
      title="Wards"
      subtitle="Live ward census — room occupancy, check-ins and check-outs at a glance"
      showFloorPlan
      manageRooms
      chartBase="/admin/patients"
    />
  );
}
