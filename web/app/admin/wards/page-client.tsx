"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBedPulse, faDoorOpen, faHospitalUser } from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../components/PageHeader";
import PatientsManager from "../../components/PatientsManager";
import RoomsClient from "./rooms-panel";

export type WardsTab = "census" | "rooms";

const TABS = [
  { key: "census", label: "Patients", icon: faHospitalUser },
  { key: "rooms", label: "Rooms", icon: faDoorOpen },
] as const;

export default function WardsClient({ initialTab }: { initialTab: WardsTab }) {
  const [tab, setTab] = useState<WardsTab>(initialTab);

  const selectTab = (next: WardsTab) => {
    setTab(next);
    // Mirrored into the URL so a reload or a shared link keeps the tab, without
    // a navigation that would refetch the page.
    const url = new URL(window.location.href);
    if (next === "rooms") url.searchParams.set("tab", "rooms");
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  };

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faBedPulse} className="w-3.5 h-3.5" />,
          label: "Ward Management",
        }}
        title="Wards"
        subtitle={
          tab === "census"
            ? "Live ward census — room occupancy, check-ins and check-outs at a glance"
            : "Manage clinical rooms, arrange the floor plan, and assign students"
        }
      />

      <div
        role="tablist"
        aria-label="Wards sections"
        className="mb-6 flex gap-1 border-b border-hairline"
      >
        {TABS.map((option) => {
          const active = tab === option.key;
          return (
            <button
              key={option.key}
              role="tab"
              aria-selected={active}
              onClick={() => selectTab(option.key)}
              className={`-mb-px inline-flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? "border-brand-600 text-brand-700"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              <FontAwesomeIcon icon={option.icon} className="w-3.5 h-3.5" />
              {option.label}
            </button>
          );
        })}
      </div>

      {tab === "census" ? (
        <PatientsManager hideHeader showFloorPlan chartBase="/admin/patients" />
      ) : (
        <RoomsClient embedded />
      )}
    </div>
  );
}
