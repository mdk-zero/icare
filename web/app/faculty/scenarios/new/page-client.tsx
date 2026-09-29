"use client";

import { useState, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faRobot,
  faArrowLeft,
  faSearch,
  faCheck,
  faSave,
  faDoorOpen,
  faTriangleExclamation,
  faFileImport,
  faLock,
  faHeartPulse,
  faUserInjured,
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import {
  createScenario,
  generateAIScenario,
  fetchFacultyPatients,
  fetchRooms,
  updateFacultyPatient,
  getCurrentFacultyUser,
  logAuditAction,
  FacultyPatient,
  Room,
  type SkillSelection,
} from "../../../lib/api";
import SkillPicker from "../skill-picker";
import { roomStatus, ROOM_STATUS_LABEL, ROOM_STATUS_TONE } from "../../../lib/rooms";
import PageHeader from "../../../components/PageHeader";
import { usePageData } from "../../../lib/use-page-data";
import { EcgLoader } from "../../../components/EcgLoader";
import { LessonPanel, useLessonImport } from "../../../components/LessonImport";
import { ChapterCard, TAUGHT_CHAPTERS, hueStyle } from "../library-plan";

// Stable empty fallbacks, so the occupancy memo is not invalidated every render.
const NO_PATIENTS: FacultyPatient[] = [];
const NO_ROOMS: Room[] = [];

const inputClassName =
  "w-full px-3.5 py-2.5 bg-surface border border-gray-300 rounded-lg text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600/25 focus:border-brand-600 transition-all text-sm";

const labelClassName =
  "block text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-600 mb-1.5";

/** A numbered section of the case sheet; the numeral turns into a tick once done. */
function SheetStep({
  n,
  title,
  hint,
  done,
  tag,
  last,
  children,
}: {
  n: number;
  title: string;
  hint?: ReactNode;
  done?: boolean;
  tag?: ReactNode;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="relative grid grid-cols-[2.25rem_1fr] gap-x-3 sm:gap-x-4 animate-rise"
      style={{ animationDelay: `${n * 60}ms` }}
    >
      {/* The rail joining this step's marker to the next one. */}
      {!last && (
        <span aria-hidden className="absolute left-[1.125rem] top-10 bottom-0 w-px bg-hairline" />
      )}
      <span
        aria-hidden
        className={`relative z-[1] flex h-9 w-9 items-center justify-center rounded-full border font-display text-[13px] font-semibold tabular-nums transition-colors ${
          done
            ? "border-brand-600 bg-brand-600 text-white"
            : "border-brand-200 bg-surface text-brand-600"
        }`}
      >
        {done ? <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" /> : String(n).padStart(2, "0")}
      </span>
      <div className={`min-w-0 ${last ? "" : "pb-8"}`}>
        <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-0.5">
          <h2 className="font-display text-base font-semibold text-gray-900">{title}</h2>
          {tag}
        </div>
        {hint && <p className="text-xs text-gray-500 -mt-0.5">{hint}</p>}
        <div className="mt-3.5">{children}</div>
      </div>
    </section>
  );
}

function OptionalTag() {
  return (
    <span className="rounded-full border border-hairline bg-subtle px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
      Optional
    </span>
  );
}

/** Beds as dots: filled for patients already in the room, hollow for free beds. */
function BedDots({ occupied, capacity }: { occupied: number; capacity: number }) {
  const shown = Math.min(capacity, 12);
  return (
    <span className="flex flex-wrap gap-[3px]" aria-hidden>
      {Array.from({ length: shown }, (_, b) => (
        <span
          key={b}
          className={`h-[7px] w-[7px] rounded-[2px] ${
            b < occupied ? "bg-brand-600" : "border border-gray-300 bg-surface"
          }`}
        />
      ))}
      {capacity > shown && <span className="text-[10px] leading-[7px] text-gray-400">+</span>}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}

const emptyForm = {
  title: "",
  description: "",
  learningObjectives: "",
  patientId: "",
  roomId: "",
};

export default function NewScenarioClient() {
  const router = useRouter();
  const [form, setForm] = useState(emptyForm);
  const [patientSearch, setPatientSearch] = useState("");

  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPatientCase, setAiPatientCase] = useState<Record<string, unknown> | null>(null);
  const [aiGenerated, setAiGenerated] = useState(false);
  // The taught chapters the AI centres the case on; none lets it pick one.
  const [chapters, setChapters] = useState<number[]>([]);
  // An imported lesson grounds the AI draft (the prompt then just steers it),
  // and its ticked chapters replace the chapter picker.
  const lessonImport = useLessonImport();
  const { lesson, analyzing, selectedTopics } = lessonImport;

  const [skills, setSkills] = useState<SkillSelection[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, loading: loadingData } = usePageData("faculty:scenario-form-refs", async () => {
    const [patients, rooms] = await Promise.all([fetchFacultyPatients(), fetchRooms()]);
    return { patients, rooms };
  });

  const patients = data?.patients ?? NO_PATIENTS;
  const rooms = data?.rooms ?? NO_ROOMS;

  const occupancyByRoom = useMemo(() => {
    const tally = new Map<string, number>();
    for (const p of patients) if (p.room_id) tally.set(p.room_id, (tally.get(p.room_id) ?? 0) + 1);
    return tally;
  }, [patients]);

  const selectedPatient = useMemo(
    () => patients.find((p) => p.id === form.patientId) ?? null,
    [patients, form.patientId],
  );

  const filteredPatients = useMemo(() => {
    const q = patientSearch.trim().toLowerCase();
    if (!q) return patients;
    return patients.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.diagnosis ?? "").toLowerCase().includes(q) ||
        (p.room_number ?? "").toLowerCase().includes(q),
    );
  }, [patients, patientSearch]);

  /** Selecting a patient defaults the room to wherever they already are. */
  const selectPatient = (patientId: string) => {
    const picked = patients.find((p) => p.id === patientId);
    setForm((prev) => ({ ...prev, patientId, roomId: picked?.room_id ?? "" }));
  };

  const toggleChapter = (chapter: number) =>
    setChapters((prev) =>
      prev.includes(chapter) ? prev.filter((c) => c !== chapter) : [...prev, chapter],
    );

  const handleGenerate = async () => {
    if (!aiPrompt.trim() && !lesson) return;
    if (!form.patientId) {
      setAiError("Select a patient first — the case is grounded on their record.");
      return;
    }
    setGenerating(true);
    setAiError(null);
    const preview = await generateAIScenario(aiPrompt, form.patientId || undefined, {
      lessonText: lesson?.lessonText,
      chapters: lesson ? selectedTopics.map((t) => t.chapter) : chapters,
    });
    if ("error" in preview) {
      setAiError(preview.error);
    } else {
      setForm((prev) => ({
        ...prev,
        title: preview.title ?? prev.title,
        description: preview.description ?? prev.description,
        learningObjectives: (preview.learning_objectives ?? []).join("\n"),
      }));
      setAiPatientCase((preview.patient_case as Record<string, unknown>) ?? null);
      // The skills the AI built the case around; faculty confirm them below.
      if (preview.skills && preview.skills.length > 0)
        setSkills(preview.skills.map((id) => ({ id })));
      setAiGenerated(true);
    }
    setGenerating(false);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!form.patientId) {
      setError("Select a patient for this patient case before saving.");
      return;
    }
    setSaving(true);
    setError(null);

    const newScenario = await createScenario({
      title: form.title,
      description: form.description,
      patient_id: form.patientId || null,
      learning_objectives: form.learningObjectives
        .split("\n")
        .map((o) => o.trim())
        .filter(Boolean),
      ...(aiGenerated ? { patient_case: aiPatientCase ?? {}, is_ai_generated: true } : {}),
      skills,
    });

    if (!newScenario) {
      setError("Unable to create patient case. Please try again.");
      setSaving(false);
      return;
    }

    const faculty = getCurrentFacultyUser();
    if (faculty) {
      logAuditAction({
        faculty_id: faculty.id,
        faculty_name: faculty.name,
        tab: "scenarios",
        action: aiGenerated ? "ai_generate_scenario" : "create_scenario",
        details: `${aiGenerated ? "AI generated and saved" : "Created"} patient case: ${newScenario.title}`,
        target_type: "scenario",
        target_id: newScenario.id,
        metadata: { scenario_title: newScenario.title },
      });
    }

    // Apply the chosen room to the linked patient (capacity-enforced by the API).
    if (
      form.patientId &&
      form.roomId &&
      selectedPatient &&
      selectedPatient.room_id !== form.roomId
    ) {
      const res = await updateFacultyPatient(form.patientId, {
        name: selectedPatient.name,
        age: selectedPatient.age,
        gender: selectedPatient.gender,
        diagnosis: selectedPatient.diagnosis,
        admission_date: selectedPatient.admission_date,
        vital_signs: selectedPatient.vital_signs,
        labs: selectedPatient.labs,
        room_id: form.roomId,
      });
      if (res.error) console.error("Room assignment failed:", res.error);
    }

    router.push("/faculty/scenarios");
  };

  const vitals = selectedPatient?.vital_signs;
  const vitalChips = vitals
    ? [
        { label: "HR", value: vitals.heart_rate, unit: "bpm" },
        { label: "BP", value: vitals.blood_pressure, unit: "" },
        { label: "Temp", value: vitals.temperature, unit: "°C" },
        { label: "RR", value: vitals.respiratory_rate, unit: "/min" },
        { label: "SpO₂", value: vitals.oxygen_saturation, unit: "%" },
      ].filter((v) => v.value !== null && v.value !== undefined && v.value !== "")
    : [];
  const selectedRoom = rooms.find((r) => r.id === form.roomId) ?? null;
  const objectives = form.learningObjectives
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);
  const chapterFocus = lesson ? selectedTopics.map((t) => t.chapter) : chapters;
  const canGenerate =
    !generating && !analyzing && !!form.patientId && (!!aiPrompt.trim() || !!lesson);
  const ready = !!form.title.trim() && !!form.patientId;

  return (
    <div className="pb-4">
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faRobot} className="w-3.5 h-3.5" />,
          label: "New Patient Case",
        }}
        title="Create Patient Case"
        subtitle="Build a clinical case by hand, or generate one with AI and edit it"
      />

      <button
        onClick={() => router.push("/faculty/scenarios")}
        className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-brand-700 transition-colors"
      >
        <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5" />
        Back to patient cases
      </button>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-5 items-start">
        {/* The case sheet: one numbered step per decision. */}
        <div className="rounded-2xl border border-hairline bg-surface p-4 sm:p-6 shadow-tile">
          {/* 01 — Patient */}
          <SheetStep
            n={1}
            title="Patient"
            done={!!selectedPatient}
            tag={<span className="text-xs font-medium text-red-600">Required</span>}
            hint="Every case is built around a patient's diagnosis and vital signs."
          >
            {selectedPatient ? (
              <div className="relative overflow-hidden rounded-xl border border-brand-200 bg-brand-50/60 animate-rise">
                <span aria-hidden className="absolute inset-y-0 left-0 w-1.5 bg-brand-600" />
                <div className="flex items-start gap-3 p-4 pl-5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand-600 font-display text-sm font-semibold text-white">
                    {initials(selectedPatient.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-lg font-semibold leading-tight text-gray-900 truncate">
                      {selectedPatient.name}
                    </p>
                    <p className="mt-0.5 text-xs text-gray-600">
                      {selectedPatient.age} yrs · {selectedPatient.gender}
                      {selectedPatient.room ? ` · Room ${selectedPatient.room.room_number}` : ""}
                    </p>
                    <p className="mt-1.5 text-sm text-gray-800">{selectedPatient.diagnosis}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, patientId: "", roomId: "" }))}
                    className="shrink-0 rounded-lg border border-brand-200 bg-surface px-2.5 py-1 text-xs font-medium text-brand-700 hover:border-brand-400 transition-colors"
                  >
                    Change
                  </button>
                </div>
                {vitalChips.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 border-t border-brand-200/70 px-4 py-2.5 pl-5">
                    <FontAwesomeIcon icon={faHeartPulse} className="mr-1 h-3.5 w-3.5 text-brand-600" />
                    {vitalChips.map((v) => (
                      <span
                        key={v.label}
                        className="inline-flex items-baseline gap-1 rounded-md bg-surface/80 border border-hairline px-2 py-0.5 text-xs"
                      >
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                          {v.label}
                        </span>
                        <span className="font-semibold tabular-nums text-gray-900">{v.value}</span>
                        {v.unit && <span className="text-[10px] text-gray-500">{v.unit}</span>}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-hairline overflow-hidden">
                <div className="relative border-b border-hairline bg-subtle p-2">
                  <FontAwesomeIcon
                    icon={faSearch}
                    className="absolute left-5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500"
                  />
                  <input
                    type="text"
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    placeholder="Search name, diagnosis, or room..."
                    className={inputClassName + " pl-9"}
                  />
                </div>
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                  {loadingData ? (
                    <div className="p-8 text-center">
                      <EcgLoader size="md" className="text-brand-600" />
                    </div>
                  ) : filteredPatients.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500">
                      {patients.length === 0
                        ? "No patients in the roster yet — add one before creating a patient case."
                        : "No patients match."}
                    </div>
                  ) : (
                    <ul className="divide-y divide-hairline">
                      {filteredPatients.map((patient) => (
                        <li key={patient.id}>
                          <button
                            type="button"
                            onClick={() => selectPatient(patient.id)}
                            className="group flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-brand-50/60 transition-colors"
                          >
                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 font-display text-[11px] font-semibold text-brand-700 group-hover:bg-brand-600 group-hover:text-white transition-colors">
                              {initials(patient.name)}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block text-sm font-medium text-gray-800 truncate">
                                {patient.name}
                              </span>
                              <span className="block text-xs text-gray-500 truncate">
                                {patient.diagnosis}
                              </span>
                            </span>
                            <span className="shrink-0 text-xs tabular-nums text-gray-500">
                              {patient.room?.name ? `Room ${patient.room.room_number}` : "No room"}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </SheetStep>

          {/* 02 — Room */}
          <SheetStep
            n={2}
            title="Room"
            done={!!form.roomId}
            tag={<OptionalTag />}
            hint={
              form.patientId
                ? "Defaults to where the patient already is. Full rooms can't take another patient."
                : "Pick a patient first to place them in a room."
            }
          >
            {!form.patientId ? (
              <div className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm text-gray-500">
                <FontAwesomeIcon icon={faLock} className="h-3.5 w-3.5 text-gray-400" />
                Waiting for a patient
              </div>
            ) : rooms.length === 0 ? (
              <p className="flex items-center gap-1.5 text-xs text-gray-500">
                <FontAwesomeIcon icon={faTriangleExclamation} className="w-3 h-3" />
                No rooms exist yet — create them in Dean → Wards.
              </p>
            ) : (
              <div
                role="radiogroup"
                aria-label="Room"
                className="grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-2 max-h-[292px] overflow-y-auto custom-scrollbar p-px"
              >
                {rooms.map((room) => {
                  const occ = occupancyByRoom.get(room.id) ?? 0;
                  const isCurrent = selectedPatient?.room_id === room.id;
                  const status = roomStatus(occ, room.capacity);
                  const disabled = status === "full" && !isCurrent;
                  const selected = form.roomId === room.id;
                  return (
                    <button
                      key={room.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={disabled}
                      onClick={() =>
                        setForm((prev) => ({ ...prev, roomId: selected ? "" : room.id }))
                      }
                      className={`flex flex-col gap-2 rounded-xl border p-3 text-left transition-all disabled:cursor-not-allowed disabled:opacity-45 ${
                        selected
                          ? "border-brand-600 bg-brand-50 shadow-[0_0_0_1px_var(--color-brand-600)]"
                          : "border-hairline bg-surface hover:border-brand-300"
                      }`}
                    >
                      <span className="flex items-start justify-between gap-2">
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-800">
                            <FontAwesomeIcon icon={faDoorOpen} className="h-3 w-3 text-gray-400" />
                            <span className="truncate">{room.name}</span>
                          </span>
                          <span className="block text-xs text-gray-500">
                            Room {room.room_number}
                            {isCurrent && (
                              <span className="ml-1.5 font-medium text-brand-700">· Current</span>
                            )}
                          </span>
                        </span>
                        <span
                          className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border ${ROOM_STATUS_TONE[status]}`}
                        >
                          {ROOM_STATUS_LABEL[status]}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <BedDots occupied={occ} capacity={room.capacity} />
                        <span className="text-[11px] tabular-nums text-gray-500">
                          {occ}/{room.capacity} beds
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </SheetStep>

          {/* 03 — AI draft */}
          <SheetStep
            n={3}
            title="Draft with AI"
            done={aiGenerated}
            tag={
              aiGenerated ? (
                <span className="rounded-full bg-brand-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-brand-700">
                  Draft filled in
                </span>
              ) : (
                <OptionalTag />
              )
            }
            hint="Describe the case, import a lesson to build it from, or both. AI fills the details and picks the Taylor's skills — everything stays editable."
          >
            <div
              className={`space-y-4 rounded-xl border border-brand-200 bg-[linear-gradient(160deg,var(--color-brand-50),transparent_70%)] p-4 transition-opacity ${
                form.patientId ? "" : "opacity-60"
              }`}
            >
              {!form.patientId && (
                <p className="flex items-center gap-2 text-xs font-medium text-brand-700">
                  <FontAwesomeIcon icon={faLock} className="h-3 w-3" />
                  Pick a patient first — the case is grounded on their record.
                </p>
              )}
              {!lesson && !analyzing && (
                <div>
                  <p className={labelClassName}>Chapter focus</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {TAUGHT_CHAPTERS.map((c) => (
                      <ChapterCard
                        key={c.chapter}
                        chapter={c}
                        selected={chapters.includes(c.chapter)}
                        disabled={generating}
                        onToggle={() => toggleChapter(c.chapter)}
                      />
                    ))}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    {chapters.length === 0
                      ? "None selected — AI centres the case on whichever taught chapter fits the patient."
                      : `The case centres on the ${chapters.length} selected chapter${chapters.length === 1 ? "" : "s"}.`}
                  </p>
                </div>
              )}
              <div>
                <label htmlFor="ai-prompt" className={labelClassName}>
                  Describe the case
                </label>
                <textarea
                  id="ai-prompt"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder={
                    lesson || analyzing
                      ? "Optional — e.g. focus on starting oxygen by nasal cannula"
                      : "e.g. Post-operative patient with falling SpO₂ and a rising respiratory rate"
                  }
                  rows={2}
                  className={inputClassName + " resize-none"}
                />
              </div>
              <LessonPanel lessonImport={lessonImport} disabled={generating}>
                <p className="text-xs text-gray-500">
                  The case centres on the ticked chapters and applies the lesson.
                </p>
              </LessonPanel>
              {aiError && <p className="text-xs text-red-600">{aiError}</p>}
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  title={!form.patientId ? "Select a patient first" : undefined}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-50 shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
                >
                  {generating ? (
                    <EcgLoader className="text-[#5eead4]" />
                  ) : (
                    <FontAwesomeIcon icon={faWandMagicSparkles} className="w-4 h-4 text-[#5eead4]" />
                  )}
                  {generating
                    ? "Generating…"
                    : aiGenerated
                      ? "Regenerate"
                      : lesson
                        ? "Generate from lesson"
                        : "Generate"}
                </button>
                <button
                  type="button"
                  onClick={lessonImport.pick}
                  disabled={generating}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:border-brand-300 hover:text-brand-700 transition-all disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faFileImport} className="w-4 h-4" />
                  {lesson || analyzing ? "Change lesson" : "Import Lesson"}
                </button>
                {lessonImport.fileInput}
              </div>
              {lesson && (
                <p className="text-xs text-gray-500">
                  The case, its nursing actions and learning objectives are drawn from the lesson
                  (.pdf, .docx, .txt or .md); the description above narrows what it focuses on.
                </p>
              )}
            </div>
          </SheetStep>

          {/* 04 — Details */}
          <SheetStep
            n={4}
            title="Case details"
            done={!!form.title.trim()}
            hint={aiGenerated ? "Filled in by AI — review and edit before saving." : "Write the case yourself, or let AI draft it above."}
          >
            <div className="space-y-4">
              <div>
                <label htmlFor="case-title" className={labelClassName}>
                  Title <span className="text-red-600">*</span>
                </label>
                <input
                  id="case-title"
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="e.g. Hypoxia After Abdominal Surgery"
                  className={inputClassName + " font-display text-base font-medium"}
                />
              </div>
              <div>
                <label htmlFor="case-description" className={labelClassName}>
                  Description
                </label>
                <textarea
                  id="case-description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="Brief overview of the patient case..."
                  className={inputClassName + " resize-none"}
                />
              </div>
              <div>
                <div className="flex items-baseline justify-between">
                  <label htmlFor="case-objectives" className={labelClassName}>
                    Learning objectives
                  </label>
                  <span className="text-[11px] tabular-nums text-gray-500">
                    {objectives.length} objective{objectives.length === 1 ? "" : "s"}
                  </span>
                </div>
                <textarea
                  id="case-objectives"
                  value={form.learningObjectives}
                  onChange={(e) => setForm({ ...form, learningObjectives: e.target.value })}
                  rows={4}
                  placeholder="One objective per line&#10;e.g. Measure SpO₂ with a pulse oximeter"
                  className={inputClassName + " resize-none leading-relaxed"}
                />
                <p className="text-xs text-gray-500 mt-1.5">Enter one objective per line.</p>
              </div>
            </div>
          </SheetStep>

          {/* 05 — Skills */}
          <SheetStep
            n={5}
            title="Taylor's skills"
            done={skills.length > 0}
            last
            hint={
              skills.length === 0
                ? "Without skills, the patient case gets the general starter task list."
                : undefined
            }
          >
            <SkillPicker
              value={skills}
              onChange={setSkills}
              disabled={saving}
              detectInput={() => ({
                title: form.title,
                description: form.description,
                learning_objectives: objectives,
                patient_id: form.patientId || null,
                lesson_text: lesson?.lessonText ?? null,
              })}
            />
          </SheetStep>
        </div>

        {/* The case at a glance, with save — pinned beside the sheet on wide screens. */}
        <aside className="xl:sticky xl:top-0 space-y-3">
          <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-tile">
            <div className="relative bg-brand-600 px-4 pb-4 pt-3.5 text-white">
              <span
                aria-hidden
                className="absolute inset-0 opacity-[0.12] bg-[repeating-linear-gradient(90deg,#fff_0,#fff_1px,transparent_1px,transparent_14px),repeating-linear-gradient(0deg,#fff_0,#fff_1px,transparent_1px,transparent_14px)]"
              />
              <p className="relative text-[10px] font-semibold uppercase tracking-[0.12em] text-white/75">
                {aiGenerated ? "AI draft · patient case" : "Patient case"}
              </p>
              <p
                className={`relative mt-1 font-display text-lg font-semibold leading-snug ${
                  form.title.trim() ? "text-white" : "text-white/55"
                }`}
              >
                {form.title.trim() || "Untitled case"}
              </p>
            </div>
            <dl className="divide-y divide-hairline text-sm">
              <div className="flex items-center gap-3 px-4 py-2.5">
                <FontAwesomeIcon icon={faUserInjured} className="h-3.5 w-3.5 text-gray-400" />
                <dt className="sr-only">Patient</dt>
                <dd className="min-w-0 flex-1 truncate">
                  {selectedPatient ? (
                    <span className="font-medium text-gray-900">{selectedPatient.name}</span>
                  ) : (
                    <span className="text-gray-400">No patient yet</span>
                  )}
                </dd>
              </div>
              <div className="flex items-center gap-3 px-4 py-2.5">
                <FontAwesomeIcon icon={faDoorOpen} className="h-3.5 w-3.5 text-gray-400" />
                <dt className="sr-only">Room</dt>
                <dd className="min-w-0 flex-1 truncate">
                  {selectedRoom ? (
                    <span className="text-gray-800">
                      {selectedRoom.name}{" "}
                      <span className="text-gray-500">· Room {selectedRoom.room_number}</span>
                    </span>
                  ) : (
                    <span className="text-gray-400">No room</span>
                  )}
                </dd>
              </div>
              <div className="grid grid-cols-3 divide-x divide-hairline">
                {[
                  { label: "Chapters", value: chapterFocus.length || "Any" },
                  { label: "Objectives", value: objectives.length },
                  { label: "Skills", value: skills.length },
                ].map((m) => (
                  <div key={m.label} className="px-3 py-2.5 text-center">
                    <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-gray-500">
                      {m.label}
                    </dt>
                    <dd className="font-display text-lg font-semibold tabular-nums text-gray-900">
                      {m.value}
                    </dd>
                  </div>
                ))}
              </div>
              {chapterFocus.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 py-2.5">
                  {chapterFocus.map((c) => (
                    <span
                      key={c}
                      style={hueStyle(c)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--hue)_35%,transparent)] bg-[color-mix(in_srgb,var(--hue)_8%,transparent)] px-2 py-0.5 text-[11px] font-medium text-gray-700"
                    >
                      <span className="h-2 w-2 rounded-sm bg-[var(--hue)]" />
                      Ch. {c}
                    </span>
                  ))}
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-2xl border border-hairline bg-surface p-4 shadow-tile">
            <ul className="space-y-1.5 text-xs">
              {[
                { ok: !!form.patientId, label: "Patient chosen" },
                { ok: !!form.title.trim(), label: "Title written" },
              ].map((c) => (
                <li key={c.label} className="flex items-center gap-2">
                  <span
                    className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                      c.ok ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300"
                    }`}
                  >
                    {c.ok && <FontAwesomeIcon icon={faCheck} className="h-2 w-2" />}
                  </span>
                  <span className={c.ok ? "text-gray-800" : "text-gray-500"}>{c.label}</span>
                </li>
              ))}
            </ul>
            {error && (
              <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
                {error}
              </div>
            )}
            <button
              onClick={handleSave}
              disabled={saving || !ready}
              title={!form.patientId ? "Select a patient first" : undefined}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
            >
              {saving ? <EcgLoader /> : <FontAwesomeIcon icon={faSave} className="w-4 h-4" />}
              {saving ? "Saving…" : "Save Patient Case"}
            </button>
            <button
              onClick={() => router.push("/faculty/scenarios")}
              className="mt-2 w-full px-5 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-subtle transition-colors"
            >
              Cancel
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
