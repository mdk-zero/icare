"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUsers,
  faHeartPulse,
  faTriangleExclamation,
  faFlask,
  faPlus,
  faPen,
  faTrash,
  faSpinner,
  faSearch,
  faTimes,
  faSave,
  faBedPulse,
  faChevronRight,
  faArrowLeft,
  faCircleCheck,
  faHospital,
} from "@fortawesome/free-solid-svg-icons";
import {
  fetchFacultyPatients,
  createFacultyPatient,
  updateFacultyPatient,
  deleteFacultyPatient,
  FacultyPatient,
} from "../../lib/api";
import { SkeletonTable } from "../../components/skeletons";
import PageHeader from "../../components/PageHeader";
import StatTile from "../../components/StatTile";

const inputClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm shadow-sm";

const labelClassName = "block text-sm font-bold text-gray-800 mb-2";

const vitalLabelClassName = "block text-xs font-bold text-gray-700 mb-1.5";

/** Patients whose room_number is blank. */
const UNASSIGNED_KEY = "__unassigned__";
/** Patients in a plain room ("Room 1115", "301-A") with no care unit named. */
const GENERAL_KEY = "__general__";

/**
 * Reference ranges used to flag a reading. Shared by the table chips and the
 * per-unit critical counts so a card and its rows can never disagree.
 */
const VITAL_RANGES: Record<string, { min: number; max: number }> = {
  heart_rate: { min: 60, max: 100 },
  temperature: { min: 36.1, max: 37.2 },
  respiratory_rate: { min: 12, max: 20 },
  oxygen_saturation: { min: 95, max: 100 },
};

type VitalState = "none" | "normal" | "low" | "high";

function vitalState(value: number | null | undefined, type: string): VitalState {
  if (value === null || value === undefined) return "none";
  const range = VITAL_RANGES[type];
  if (!range) return "normal";
  if (value < range.min) return "low";
  if (value > range.max) return "high";
  return "normal";
}

const VITAL_TONE: Record<VitalState, string> = {
  none: "border-gray-200 bg-gray-50 text-gray-400",
  normal: "border-emerald-200 bg-emerald-50 text-emerald-700",
  low: "border-amber-200 bg-amber-50 text-amber-700",
  high: "border-rose-200 bg-rose-50 text-rose-700",
};

/** A patient is flagged when any numeric vital sits outside its range. */
function isCritical(patient: FacultyPatient): boolean {
  const v = patient.vital_signs;
  if (!v) return false;
  return (
    ["heart_rate", "temperature", "respiratory_rate", "oxygen_saturation"] as const
  ).some((key) => {
    const state = vitalState(v[key], key);
    return state === "low" || state === "high";
  });
}

/**
 * Three-way, because a quarter of the roster carries no readings at all: folding
 * those into "stable" would claim they had been checked. Keeping "none" separate
 * is also what lets the two headline tiles stop short of the total honestly.
 */
function vitalStatus(patient: FacultyPatient): "critical" | "stable" | "none" {
  const v = patient.vital_signs;
  const recorded =
    !!v &&
    (v.heart_rate != null ||
      v.temperature != null ||
      v.respiratory_rate != null ||
      v.oxygen_saturation != null ||
      !!v.blood_pressure);
  if (!recorded) return "none";
  return isCritical(patient) ? "critical" : "stable";
}

/**
 * The seeded MIMIC rows spell it "Male"/"Female" while the form writes "M"/"F";
 * matching on the raw column would silently drop the long-form records.
 */
function genderCode(raw: string | null | undefined): string {
  const value = (raw ?? "").trim().toLowerCase();
  if (value.startsWith("m")) return "M";
  if (value.startsWith("f")) return "F";
  return "U";
}

function ageBand(age: number | null | undefined): string {
  if (age == null || Number.isNaN(age)) return "";
  if (age < 40) return "under40";
  if (age < 65) return "40to64";
  if (age < 80) return "65to79";
  return "80plus";
}

function hasLabs(patient: FacultyPatient): boolean {
  return Object.keys(patient.labs ?? {}).length > 0;
}

type FilterKey = "status" | "gender" | "age" | "labs";
type Filters = Record<FilterKey, string>;

const NO_FILTERS: Filters = { status: "all", gender: "all", age: "all", labs: "all" };

/**
 * One bucket function per filter, used for both the matching and the option
 * counts, so a dropdown can never advertise a number the table disagrees with.
 * An empty bucket means the patient falls outside every option in that
 * dimension and is excluded whenever it is narrowed.
 */
const FILTER_BUCKETS: Record<FilterKey, (patient: FacultyPatient) => string> = {
  status: vitalStatus,
  gender: (p) => genderCode(p.gender),
  age: (p) => ageBand(p.age),
  labs: (p) => (hasLabs(p) ? "has" : "missing"),
};

const FILTER_KEYS = Object.keys(FILTER_BUCKETS) as FilterKey[];

const FILTER_OPTIONS: Record<
  FilterKey,
  { label: string; options: { value: string; label: string }[] }
> = {
  status: {
    label: "Filter by vitals",
    options: [
      { value: "all", label: "Any vitals" },
      { value: "critical", label: "Critical" },
      { value: "stable", label: "Stable" },
      { value: "none", label: "Vitals not recorded" },
    ],
  },
  gender: {
    label: "Filter by gender",
    options: [
      { value: "all", label: "Any gender" },
      { value: "M", label: "Male" },
      { value: "F", label: "Female" },
      { value: "U", label: "Unspecified" },
    ],
  },
  age: {
    label: "Filter by age",
    options: [
      { value: "all", label: "Any age" },
      { value: "under40", label: "Under 40" },
      { value: "40to64", label: "40–64" },
      { value: "65to79", label: "65–79" },
      { value: "80plus", label: "80+" },
    ],
  },
  labs: {
    label: "Filter by labs",
    options: [
      { value: "all", label: "Any labs" },
      { value: "has", label: "Labs on file" },
      { value: "missing", label: "No labs" },
    ],
  },
};

/** `except` leaves one dimension open so its own options can be counted. */
function matchesFilters(patient: FacultyPatient, filters: Filters, except?: FilterKey): boolean {
  return FILTER_KEYS.every(
    (key) =>
      key === except || filters[key] === "all" || FILTER_BUCKETS[key](patient) === filters[key],
  );
}

function matchesSearch(patient: FacultyPatient, query: string): boolean {
  if (!query) return true;
  return (
    patient.name.toLowerCase().includes(query) ||
    (patient.diagnosis ?? "").toLowerCase().includes(query) ||
    (patient.mimic_id ?? "").toLowerCase().includes(query)
  );
}

/**
 * Its own box, separate from the patient search. room_number holds both the
 * unit name and the room number as one string, so "CVICU", "cardiac", or the
 * bare "4108" all narrow it.
 */
function matchesRoom(patient: FacultyPatient, roomQuery: string): boolean {
  if (!roomQuery) return true;
  return (patient.room_number ?? "").toLowerCase().includes(roomQuery);
}

function FilterSelect({
  filterKey,
  value,
  counts,
  onChange,
}: {
  filterKey: FilterKey;
  value: string;
  counts: Record<string, number>;
  onChange: (key: FilterKey, value: string) => void;
}) {
  const { label, options } = FILTER_OPTIONS[filterKey];
  const active = value !== "all";

  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(filterKey, e.target.value)}
      className={`px-3 py-2 bg-surface border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all cursor-pointer ${
        active
          ? "border-brand-600 bg-brand-600/5 text-brand-700 font-medium"
          : "border-gray-200 text-gray-700"
      }`}
    >
      {options.map((option) => {
        const count = counts[option.value] ?? 0;
        return (
          <option
            key={option.value}
            value={option.value}
            // Shown rather than hidden so the zero itself is the answer, but
            // not selectable — picking it would only empty the screen.
            disabled={count === 0 && option.value !== value}
          >
            {option.label} ({count})
          </option>
        );
      })}
    </select>
  );
}

interface RoomLocation {
  /** Care unit, e.g. "Cardiac Vascular Intensive Care Unit (CVICU)". */
  unit: string;
  /** Room within that unit, e.g. "4108". */
  room: string;
}

/**
 * room_number is one free-text field holding both parts, as MIMIC exports them:
 * "Cardiac Vascular Intensive Care Unit (CVICU) Room 4108". Everything before
 * the last "Room " is the unit; a value with no "Room " at all is taken as a
 * bare room number ("301-A").
 */
function parseLocation(raw: string | null | undefined): RoomLocation {
  const value = (raw ?? "").trim();
  if (!value) return { unit: "", room: "" };
  const marker = value.lastIndexOf("Room ");
  if (marker === -1) return { unit: "", room: value };
  return { unit: value.slice(0, marker).trim(), room: value.slice(marker + "Room ".length).trim() };
}

/** The parenthetical code is what staff actually say: CVICU, MICU/SICU. */
function shortCode(unit: string): string {
  const match = unit.match(/\(([^)]+)\)\s*$/);
  return match ? match[1] : unit;
}

/** Rooms sort naturally by their leading number, not as strings. */
function compareRooms(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return na - nb;
  return a.localeCompare(b);
}

interface UnitGroup {
  key: string;
  /** Short label shown on the card. */
  label: string;
  /** Full unit name, empty when it adds nothing to the label. */
  fullName: string;
  /** Patients left after the search filter. */
  patients: FacultyPatient[];
  /** Patients before filtering, so a card can show "3 of 12". */
  total: number;
}

interface PatientForm {
  name: string;
  age: string;
  gender: string;
  room_number: string;
  diagnosis: string;
  admission_date: string;
  vital_signs: {
    heart_rate: string;
    blood_pressure: string;
    temperature: string;
    respiratory_rate: string;
    oxygen_saturation: string;
  };
  labs: Record<string, string | number | null>;
}

const emptyPatient: PatientForm = {
  name: "",
  age: "",
  gender: "",
  room_number: "",
  diagnosis: "",
  admission_date: new Date().toISOString().slice(0, 16),
  vital_signs: {
    heart_rate: "",
    blood_pressure: "",
    temperature: "",
    respiratory_rate: "",
    oxygen_saturation: "",
  },
  labs: {},
};

/** Compact readings, replacing the five numeric columns the table used to carry. */
function VitalChips({ patient }: { patient: FacultyPatient }) {
  const v = patient.vital_signs;
  const readings: { key: string; label: string; state: VitalState }[] = [
    {
      key: "heart_rate",
      label: v?.heart_rate != null ? `HR ${v.heart_rate}` : "HR —",
      state: vitalState(v?.heart_rate, "heart_rate"),
    },
    {
      key: "blood_pressure",
      label: v?.blood_pressure ? `BP ${v.blood_pressure}` : "BP —",
      state: v?.blood_pressure ? "normal" : "none",
    },
    {
      key: "temperature",
      label: v?.temperature != null ? `${v.temperature}°C` : "Temp —",
      state: vitalState(v?.temperature, "temperature"),
    },
    {
      key: "respiratory_rate",
      label: v?.respiratory_rate != null ? `RR ${v.respiratory_rate}` : "RR —",
      state: vitalState(v?.respiratory_rate, "respiratory_rate"),
    },
    {
      key: "oxygen_saturation",
      label: v?.oxygen_saturation != null ? `SpO₂ ${v.oxygen_saturation}%` : "SpO₂ —",
      state: vitalState(v?.oxygen_saturation, "oxygen_saturation"),
    },
  ];

  return (
    <div className="flex flex-wrap gap-1">
      {readings.map((r) => (
        <span
          key={r.key}
          className={`inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-none ${VITAL_TONE[r.state]}`}
        >
          {r.label}
        </span>
      ))}
    </div>
  );
}

export default function FacultyPatientsClient() {
  const [patients, setPatients] = useState<FacultyPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roomSearch, setRoomSearch] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [selectedUnit, setSelectedUnit] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPatient, setEditingPatient] = useState<FacultyPatient | null>(null);
  const [form, setForm] = useState<PatientForm>(emptyPatient);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetched whole and filtered in the browser: grouping needs the unfiltered
  // roster to show each unit's real size while a search is narrowing it.
  const loadPatients = useCallback(async () => {
    const data = await fetchFacultyPatients();
    setPatients(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    // The roster is remote, so it can only be populated after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadPatients();
  }, [loadPatients]);

  const query = search.trim().toLowerCase();
  const roomQuery = roomSearch.trim().toLowerCase();

  const filteredPatients = useMemo(
    () =>
      patients.filter(
        (p) => matchesSearch(p, query) && matchesRoom(p, roomQuery) && matchesFilters(p, filters),
      ),
    [patients, query, roomQuery, filters],
  );

  // Each dropdown counts against every *other* active filter, so a zero means
  // that combination is genuinely empty rather than merely hidden by the
  // dropdown's own current value.
  const facets = useMemo(() => {
    const result = {} as Record<FilterKey, Record<string, number>>;
    for (const key of FILTER_KEYS) {
      const base = patients.filter(
        (p) => matchesSearch(p, query) && matchesRoom(p, roomQuery) && matchesFilters(p, filters, key),
      );
      const tally: Record<string, number> = { all: base.length };
      for (const patient of base) {
        const bucket = FILTER_BUCKETS[key](patient);
        if (bucket) tally[bucket] = (tally[bucket] ?? 0) + 1;
      }
      result[key] = tally;
    }
    return result;
  }, [patients, query, roomQuery, filters]);

  // Headline counts stay on the whole roster: the tiles double as filter
  // buttons, and a button whose number moves when you press it is a poor target.
  const rosterStatus = useMemo(() => {
    const tally = { critical: 0, stable: 0, none: 0 };
    for (const patient of patients) tally[vitalStatus(patient)]++;
    return tally;
  }, [patients]);

  const labsOnFile = useMemo(() => patients.filter(hasLabs).length, [patients]);

  const unitGroups = useMemo<UnitGroup[]>(() => {
    const matching = new Set(filteredPatients.map((p) => p.id));
    const byKey = new Map<string, UnitGroup>();

    for (const patient of patients) {
      const { unit, room } = parseLocation(patient.room_number);
      const key = !unit && !room ? UNASSIGNED_KEY : unit || GENERAL_KEY;

      let group = byKey.get(key);
      if (!group) {
        const label =
          key === UNASSIGNED_KEY
            ? "Unassigned"
            : key === GENERAL_KEY
              ? "General Ward"
              : shortCode(unit);
        group = {
          key,
          label,
          fullName: key === GENERAL_KEY || key === UNASSIGNED_KEY || label === unit ? "" : unit,
          patients: [],
          total: 0,
        };
        byKey.set(key, group);
      }
      group.total++;
      if (matching.has(patient.id)) group.patients.push(patient);
    }

    for (const group of byKey.values()) {
      group.patients.sort((a, b) =>
        compareRooms(parseLocation(a.room_number).room, parseLocation(b.room_number).room),
      );
    }

    // Named units first, then the catch-alls.
    const rank = (key: string) =>
      key === UNASSIGNED_KEY ? 2 : key === GENERAL_KEY ? 1 : 0;
    return [...byKey.values()].sort((a, b) => {
      const byRank = rank(a.key) - rank(b.key);
      return byRank !== 0 ? byRank : a.label.localeCompare(b.label);
    });
  }, [patients, filteredPatients]);

  const selectedGroup = unitGroups.find((g) => g.key === selectedUnit) ?? null;
  const filtersActive =
    query !== "" || roomQuery !== "" || FILTER_KEYS.some((key) => filters[key] !== "all");

  // Narrowing to a handful of patients should not leave a screen of "0 patients"
  // cards to scroll past; the count of what was dropped keeps the omission visible.
  const visibleGroups = filtersActive
    ? unitGroups.filter((group) => group.patients.length > 0)
    : unitGroups;
  const hiddenGroups = unitGroups.length - visibleGroups.length;

  const setFilter = (key: FilterKey, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: value }));

  /** Stat tiles toggle, so a second press on the same tile returns to the roster. */
  const toggleFilter = (key: FilterKey, value: string) =>
    setFilters((prev) => ({ ...prev, [key]: prev[key] === value ? "all" : value }));

  const clearAll = () => {
    setFilters(NO_FILTERS);
    setSearch("");
    setRoomSearch("");
  };

  const openAddModal = () => {
    setEditingPatient(null);
    // Drilled into a unit, a new patient almost certainly belongs to it.
    const prefix =
      selectedGroup && selectedGroup.key !== UNASSIGNED_KEY && selectedGroup.key !== GENERAL_KEY
        ? `${selectedGroup.fullName || selectedGroup.label} Room `
        : "";
    setForm({ ...emptyPatient, room_number: prefix });
    setError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (patient: FacultyPatient) => {
    setEditingPatient(patient);
    setForm({
      name: patient.name,
      age: String(patient.age ?? ""),
      gender: patient.gender,
      room_number: patient.room_number,
      diagnosis: patient.diagnosis,
      admission_date: patient.admission_date
        ? new Date(patient.admission_date).toISOString().slice(0, 16)
        : new Date().toISOString().slice(0, 16),
      vital_signs: {
        heart_rate: patient.vital_signs?.heart_rate?.toString() ?? "",
        blood_pressure: patient.vital_signs?.blood_pressure ?? "",
        temperature: patient.vital_signs?.temperature?.toString() ?? "",
        respiratory_rate: patient.vital_signs?.respiratory_rate?.toString() ?? "",
        oxygen_saturation: patient.vital_signs?.oxygen_saturation?.toString() ?? "",
      },
      labs: patient.labs || {},
    });
    setError(null);
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingPatient(null);
    setForm(emptyPatient);
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      name: form.name,
      age: parseInt(form.age, 10),
      gender: form.gender,
      room_number: form.room_number,
      diagnosis: form.diagnosis,
      admission_date: form.admission_date,
      vital_signs: {
        heart_rate: form.vital_signs.heart_rate ? Number(form.vital_signs.heart_rate) : null,
        blood_pressure: form.vital_signs.blood_pressure || null,
        temperature: form.vital_signs.temperature ? Number(form.vital_signs.temperature) : null,
        respiratory_rate: form.vital_signs.respiratory_rate
          ? Number(form.vital_signs.respiratory_rate)
          : null,
        oxygen_saturation: form.vital_signs.oxygen_saturation
          ? Number(form.vital_signs.oxygen_saturation)
          : null,
      },
      labs: form.labs,
    };

    let result;
    if (editingPatient) {
      result = await updateFacultyPatient(editingPatient.id, payload);
    } else {
      result = await createFacultyPatient(payload);
    }

    if (result.error) {
      setError(result.error);
      setSaving(false);
      return;
    }

    await loadPatients();
    setSaving(false);
    closeModal();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this patient record?")) return;
    setDeletingId(id);
    const result = await deleteFacultyPatient(id);
    if (result.error) {
      alert(result.error);
    } else {
      await loadPatients();
    }
    setDeletingId(null);
  };

  const updateFormField = (field: keyof PatientForm, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateVitalField = (field: keyof PatientForm["vital_signs"], value: string) => {
    setForm((prev) => ({
      ...prev,
      vital_signs: {
        ...prev.vital_signs,
        [field]: value,
      },
    }));
  };

  return (
    <div>
      <PageHeader
        badge={{
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          ),
          label: "MIMIC-IV Demo",
        }}
        title="Patient Records"
        subtitle="Browse patients by care unit, then open a room's census"
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
        <StatTile
          icon={<FontAwesomeIcon icon={faUsers} className="w-5 h-5" />}
          value={patients.length}
          label="Total Patients"
          caption={`${unitGroups.length} care unit${unitGroups.length === 1 ? "" : "s"}`}
          iconBg="bg-brand-600/10"
          iconColor="text-brand-600"
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faTriangleExclamation} className="w-5 h-5" />}
          value={rosterStatus.critical}
          label="Critical Vitals"
          caption="Outside reference range"
          iconBg="bg-red-50"
          iconColor="text-red-600"
          onClick={() => toggleFilter("status", "critical")}
          className={filters.status === "critical" ? "ring-2 ring-red-500/40" : ""}
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faHeartPulse} className="w-5 h-5" />}
          value={rosterStatus.stable}
          label="Stable"
          caption={
            rosterStatus.none > 0
              ? `${rosterStatus.none} not yet recorded`
              : "All readings in range"
          }
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
          onClick={() => toggleFilter("status", "stable")}
          className={filters.status === "stable" ? "ring-2 ring-emerald-500/40" : ""}
        />
        <StatTile
          icon={<FontAwesomeIcon icon={faFlask} className="w-5 h-5" />}
          value={labsOnFile}
          label="Lab Results Available"
          caption={
            labsOnFile < patients.length
              ? `${patients.length - labsOnFile} without labs`
              : undefined
          }
          iconBg="bg-purple-50"
          iconColor="text-purple-600"
          onClick={() => toggleFilter("labs", "has")}
          className={filters.labs === "has" ? "ring-2 ring-purple-500/40" : ""}
        />
      </div>

      {/* Top level: search rooms/units and filter the population, all on one
          wrapping row. The patient search lives inside a unit (below), so it is
          not shown here. */}
      {!selectedGroup && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative w-full sm:w-64">
            <FontAwesomeIcon
              icon={faSearch}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search room or unit..."
              value={roomSearch}
              onChange={(e) => setRoomSearch(e.target.value)}
              className={inputClassName + " pl-10"}
            />
          </div>

          {!loading && patients.length > 0 && (
            <>
              {FILTER_KEYS.map((key) => (
                <FilterSelect
                  key={key}
                  filterKey={key}
                  value={filters[key]}
                  counts={facets[key]}
                  onChange={setFilter}
                />
              ))}
              {filtersActive && (
                <button
                  onClick={clearAll}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <FontAwesomeIcon icon={faTimes} className="w-3 h-3" />
                  Clear all
                </button>
              )}
            </>
          )}

          <div className="flex items-center gap-3 ml-auto">
            {!loading && patients.length > 0 && (
              <span className="text-xs font-medium text-gray-500 whitespace-nowrap">
                {filtersActive
                  ? `${filteredPatients.length} of ${patients.length} patients`
                  : `${patients.length} patients`}
              </span>
            )}
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-600 hover:bg-[#145a68] text-white text-sm font-medium rounded-lg transition-colors shadow-[0_2px_6px_rgba(27,107,123,0.2)] whitespace-nowrap"
            >
              <FontAwesomeIcon icon={faPlus} className="w-4 h-4" />
              Add Patient
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonTable rows={5} cols={5} />
      ) : patients.length === 0 ? (
        <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-12 text-center">
          <FontAwesomeIcon icon={faUsers} className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700">No patients found</h3>
          <p className="text-gray-500 text-sm mt-1">
            Seed MIMIC-IV Demo data with npm run db:seed:mimic-demo.
          </p>
        </div>
      ) : !selectedGroup ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleGroups.map((group) => {
            const critical = group.patients.filter(isCritical).length;
            const isCatchAll = group.key === GENERAL_KEY || group.key === UNASSIGNED_KEY;
            const rooms = new Set(
              group.patients.map((p) => parseLocation(p.room_number).room).filter(Boolean),
            ).size;
            return (
              <button
                key={group.key}
                onClick={() => {
                  setSelectedUnit(group.key);
                  // Fresh patient search per unit; it only applies in here.
                  setSearch("");
                }}
                // Flex column so the status badge sits on the card's floor:
                // units without a full name would otherwise ride up.
                className="group flex h-full flex-col text-left bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-brand-600/30 transition-all duration-200 p-5"
              >
                {/* flex-1 so this absorbs the slack and the footer keeps its gap. */}
                <div className="flex-1">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                        isCatchAll ? "bg-gray-100 text-gray-500" : "bg-brand-600/10 text-brand-600"
                      }`}
                    >
                      <FontAwesomeIcon
                        icon={group.key === UNASSIGNED_KEY ? faBedPulse : faHospital}
                        className="w-5 h-5"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{group.label}</p>
                      <p className="text-xs text-gray-500">
                        {group.patients.length} patient{group.patients.length === 1 ? "" : "s"}
                        {filtersActive && group.patients.length !== group.total && (
                          <span className="text-gray-400"> of {group.total}</span>
                        )}
                        {rooms > 0 && <span className="text-gray-400"> · {rooms} room{rooms === 1 ? "" : "s"}</span>}
                      </p>
                    </div>
                  </div>
                  <FontAwesomeIcon
                    icon={faChevronRight}
                    className="w-3.5 h-3.5 mt-3.5 text-gray-300 group-hover:text-brand-600 group-hover:translate-x-0.5 transition-all shrink-0"
                  />
                </div>

                {group.fullName && (
                  <p className="mt-3 text-xs leading-snug text-gray-400 line-clamp-2">
                    {group.fullName}
                  </p>
                )}
                </div>

                {/* A card only reaches here with at least one patient: empty
                    units are dropped from visibleGroups. */}
                <div className="mt-4 pt-4 border-t border-gray-100 flex flex-wrap items-center gap-2">
                  {critical > 0 ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700 border border-red-200">
                      <FontAwesomeIcon icon={faTriangleExclamation} className="w-3 h-3" />
                      {critical} critical
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700 border border-emerald-200">
                      <FontAwesomeIcon icon={faCircleCheck} className="w-3 h-3" />
                      All stable
                    </span>
                  )}
                </div>
              </button>
            );
          })}

          {visibleGroups.length === 0 && (
            <div className="col-span-full bg-surface rounded-xl border border-hairline p-12 text-center">
              <FontAwesomeIcon icon={faSearch} className="w-8 h-8 text-gray-300" />
              <p className="mt-3 font-semibold text-gray-700">
                {/* One string: JSX drops the space at an expression/text
                    boundary that straddles a line break. */}
                {query
                  ? `No patients match “${search}”`
                  : roomQuery
                    ? `No rooms match “${roomSearch}”`
                    : "No patients match the current filters"}
              </p>
              <button
                onClick={clearAll}
                className="mt-3 text-sm font-medium text-brand-600 hover:text-brand-700"
              >
                Clear all filters
              </button>
            </div>
          )}

          {hiddenGroups > 0 && (
            <p className="col-span-full text-center text-xs text-gray-400">
              {hiddenGroups === 1
                ? "1 care unit hidden — no patients match"
                : `${hiddenGroups} care units hidden — no patients match`}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <button
              onClick={() => {
                setSelectedUnit(null);
                // Clear so a leftover patient query does not silently filter
                // the unit grid, where its box is not shown.
                setSearch("");
              }}
              className="inline-flex items-center gap-2 px-3 py-2 bg-surface border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
            >
              <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5" />
              All units
            </button>
            <div className="min-w-0">
              <h2 className="font-display text-lg font-bold text-gray-900 truncate">
                {selectedGroup.label}
              </h2>
              {selectedGroup.fullName && (
                <p className="text-xs text-gray-500 truncate">{selectedGroup.fullName}</p>
              )}
            </div>
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-brand-600/10 text-brand-700 border border-brand-600/20">
              {selectedGroup.patients.length} patient
              {selectedGroup.patients.length === 1 ? "" : "s"}
            </span>
            <button
              onClick={openAddModal}
              className="ml-auto inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-[#145a68] text-white text-sm font-medium rounded-lg transition-colors"
            >
              <FontAwesomeIcon icon={faPlus} className="w-3.5 h-3.5" />
              Add to {selectedGroup.label}
            </button>
          </div>

          {/* Patient search, scoped to this unit's census. */}
          <div className="relative w-full sm:w-72 mb-4">
            <FontAwesomeIcon
              icon={faSearch}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search patients, diagnosis, MIMIC ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={inputClassName + " pl-10"}
            />
          </div>

          <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-subtle border-b border-gray-100">
                  <tr>
                    {["Patient", "Room", "Diagnosis", "Vitals", ""].map((h, i) => (
                      <th
                        key={h || i}
                        className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {selectedGroup.patients.map((patient) => {
                    const critical = isCritical(patient);
                    const { room } = parseLocation(patient.room_number);
                    return (
                      <tr key={patient.id} className="hover:bg-subtle transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold shrink-0 ${
                                critical ? "bg-rose-50 text-rose-600" : "bg-brand-600/10 text-brand-600"
                              }`}
                            >
                              {patient.name.charAt(0)}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="font-semibold text-gray-800 truncate">{patient.name}</p>
                                {critical && (
                                  <span className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-600">
                                    Critical
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-gray-500">
                                {patient.age}yo {patient.gender} ·{" "}
                                <span className="font-mono text-xs">{patient.mimic_id}</span>
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-sm text-gray-700">{room || "—"}</span>
                        </td>
                        <td className="py-3 px-4 max-w-xs">
                          {/* Diagnoses are long enough to truncate, so keep the
                              full text reachable on hover. */}
                          <span
                            title={patient.diagnosis}
                            className="px-2 py-1 bg-gray-100 text-gray-700 text-sm rounded inline-block truncate max-w-full align-middle"
                          >
                            {patient.diagnosis}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <VitalChips patient={patient} />
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEditModal(patient)}
                              className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                              title="Edit patient"
                            >
                              <FontAwesomeIcon icon={faPen} className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(patient.id)}
                              disabled={deletingId === patient.id}
                              className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Delete patient"
                            >
                              {deletingId === patient.id ? (
                                <FontAwesomeIcon icon={faSpinner} className="w-4 h-4 animate-spin" />
                              ) : (
                                <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {selectedGroup.patients.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-gray-400">
                        {filtersActive
                          ? `No patients in ${selectedGroup.label} match the current filters`
                          : "No patients in this unit"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-surface rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col border border-hairline">
            <div className="flex items-center justify-between p-4 border-b border-hairline bg-subtle">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-brand-600/10 rounded-lg flex items-center justify-center">
                  <FontAwesomeIcon icon={editingPatient ? faPen : faPlus} className="text-brand-600 w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {editingPatient ? "Edit Patient" : "Add Patient"}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {editingPatient ? "Update patient record" : "Create a new patient record"}
                  </p>
                </div>
              </div>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
              >
                <FontAwesomeIcon icon={faTimes} className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 custom-scrollbar">

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className={labelClassName}>
                    Full Name
                  </label>
                  <input
                    required
                    type="text"
                    value={form.name || ""}
                    onChange={(e) => updateFormField("name", e.target.value)}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName}>Gender</label>
                  <select
                    required
                    value={form.gender || ""}
                    onChange={(e) => updateFormField("gender", e.target.value)}
                    className={inputClassName}
                  >
                    <option value="">Select gender</option>
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="U">Unknown</option>
                  </select>
                </div>
                <div>
                  <label className={labelClassName}>Age</label>
                  <input
                    required
                    type="number"
                    min={0}
                    max={150}
                    value={form.age ?? ""}
                    onChange={(e) => updateFormField("age", e.target.value)}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName}>
                    Room Number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Medical Intensive Care Unit (MICU) Room 4103"
                    value={form.room_number || ""}
                    onChange={(e) => updateFormField("room_number", e.target.value)}
                    className={inputClassName}
                  />
                  <p className="mt-1.5 text-xs text-gray-500">
                    The care unit before “Room” is what groups this patient on the previous screen.
                  </p>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClassName}>
                    Diagnosis
                  </label>
                  <input
                    required
                    type="text"
                    value={form.diagnosis || ""}
                    onChange={(e) => updateFormField("diagnosis", e.target.value)}
                    className={inputClassName}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelClassName}>
                    Admission Date
                  </label>
                  <input
                    required
                    type="datetime-local"
                    value={form.admission_date || ""}
                    onChange={(e) => updateFormField("admission_date", e.target.value)}
                    className={inputClassName}
                  />
                </div>
              </div>

              <div>
                <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <FontAwesomeIcon icon={faHeartPulse} className="w-4 h-4 text-red-500" />
                  Vital Signs
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div>
                    <label className={vitalLabelClassName}>
                      Heart Rate (bpm)
                    </label>
                    <input
                      type="number"
                      value={form.vital_signs?.heart_rate ?? ""}
                      onChange={(e) => updateVitalField("heart_rate", e.target.value)}
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className={vitalLabelClassName}>
                      Blood Pressure
                    </label>
                    <input
                      type="text"
                      placeholder="120/80"
                      value={form.vital_signs?.blood_pressure || ""}
                      onChange={(e) => updateVitalField("blood_pressure", e.target.value)}
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className={vitalLabelClassName}>
                      Temperature (°C)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={form.vital_signs?.temperature ?? ""}
                      onChange={(e) => updateVitalField("temperature", e.target.value)}
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className={vitalLabelClassName}>
                      Respiratory Rate
                    </label>
                    <input
                      type="number"
                      value={form.vital_signs?.respiratory_rate ?? ""}
                      onChange={(e) => updateVitalField("respiratory_rate", e.target.value)}
                      className={inputClassName}
                    />
                  </div>
                  <div>
                    <label className={vitalLabelClassName}>
                      SpO2 (%)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={form.vital_signs?.oxygen_saturation ?? ""}
                      onChange={(e) => updateVitalField("oxygen_saturation", e.target.value)}
                      className={inputClassName}
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-hairline">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-5 py-2.5 bg-surface border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-[#145a68] disabled:opacity-60 text-white font-medium rounded-lg transition-colors shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
                >
                  {saving && <FontAwesomeIcon icon={faSpinner} className="w-4 h-4 animate-spin" />}
                  <FontAwesomeIcon icon={faSave} className="w-4 h-4" />
                  {saving ? "Saving..." : "Save Patient"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}
