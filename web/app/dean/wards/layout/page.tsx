import type { Metadata } from "next";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft } from "@fortawesome/free-solid-svg-icons";
import PatientsManager from "../../../components/PatientsManager";

export const metadata: Metadata = {
  title: "Rooms & Layout | iCARE++",
};

/**
 * What only a Dean or Program Chair does with the ward: arrange the floor
 * plan and add, edit or remove rooms, with the patient census the rooms were
 * built around. Wards itself shows what students do in each room.
 */
export default function AdminWardLayoutPage() {
  return (
    <div>
      <Link
        href="/dean/wards"
        className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-brand-700"
      >
        <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" aria-hidden />
        Wards
      </Link>
      <PatientsManager
        badgeLabel="Wards"
        title="Rooms & Layout"
        subtitle="Arrange the floor plan, add or edit rooms, and see the patient census"
        showFloorPlan
        manageRooms
      />
    </div>
  );
}
