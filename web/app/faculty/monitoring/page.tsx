import type { Metadata } from "next";
import PatientsManager from "../../components/PatientsManager";

export const metadata: Metadata = {
  title: "Monitoring | iCARE++ Faculty",
};

/**
 * The ward census as its own sidebar destination. Same manager as
 * /faculty/patients — check-in/check-out, room occupancy, and discharge
 * state are the monitoring surface, so this needed a page and a nav
 * entry, not a parallel implementation.
 */
export default function FacultyMonitoringPage() {
  return (
    <PatientsManager
      badgeLabel="Ward Monitoring"
      title="Monitoring"
      subtitle="Live ward census — room occupancy, check-ins and check-outs at a glance"
      showFloorPlan
    />
  );
}
