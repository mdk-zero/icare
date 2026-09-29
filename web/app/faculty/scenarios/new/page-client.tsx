"use client";

import { useState, useMemo } from "react";
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
import { ACTIVE_CHAPTERS, TAYLORS_CHAPTERS } from "../../../../scripts/taylors-chapters";

/** The Taylor's chapters the app teaches, which a patient case centres on. */
const TAUGHT_CHAPTERS = TAYLORS_CHAPTERS.filter((c) => ACTIVE_CHAPTERS.includes(c.chapter));

// Stable empty fallbacks, so the occupancy memo is not invalidated every render.
const NO_PATIENTS: FacultyPatient[] = [];
const NO_ROOMS: Room[] = [];

const inputClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm shadow-sm";

const labelClassName = "block text-sm font-bold text-gray-800 mb-2";

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

  return (
    <div>
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
        className="mb-4 inline-flex items-center gap-2 px-3 py-2 bg-surface border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-all"
      >
        <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5" />
        Back to patient cases
      </button>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-50 text-red-700 text-sm border border-red-200">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Left: AI + details */}
        <div className="space-y-4">
          {/* AI assist */}
          <div className="rounded-xl border border-brand-200 bg-brand-50/40 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <FontAwesomeIcon icon={faRobot} className="w-4 h-4 text-brand-600" />
              <span className="text-sm font-semibold text-gray-800">Generate with AI</span>
              {aiGenerated && (
                <span className="ml-auto text-xs font-medium text-brand-700">
                  Draft filled in — edit below
                </span>
              )}
            </div>
            <p className="text-xs text-gray-500">
              Pick a patient on the right first — every case is built around their diagnosis and
              vital signs. Then describe the case, import a lesson to build it from, or both; AI
              fills the fields and picks the Taylor&apos;s skills. You can edit everything before
              saving.
            </p>
            <textarea
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
            {!lesson && !analyzing && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-gray-600 mb-1.5">
                  Chapters
                </p>
                <div className="flex flex-wrap gap-2">
                  {TAUGHT_CHAPTERS.map((c) => (
                    <button
                      key={c.chapter}
                      type="button"
                      onClick={() => toggleChapter(c.chapter)}
                      disabled={generating}
                      aria-pressed={chapters.includes(c.chapter)}
                      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all disabled:opacity-50 ${
                        chapters.includes(c.chapter)
                          ? "bg-brand-100 text-brand-700 border-brand-300"
                          : "bg-surface text-gray-600 border-gray-300 hover:border-brand-300"
                      }`}
                    >
                      Chapter {c.chapter} · {c.name}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 mt-1.5">
                  {chapters.length === 0
                    ? "None selected — AI centres the case on whichever taught chapter fits the patient."
                    : `The case centres on the ${chapters.length} selected chapter${chapters.length === 1 ? "" : "s"}.`}
                </p>
              </div>
            )}
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
                disabled={
                  generating ||
                  !!analyzing ||
                  !form.patientId ||
                  (!aiPrompt.trim() && !lesson)
                }
                title={!form.patientId ? "Select a patient first" : undefined}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold rounded-lg transition-all disabled:opacity-50"
              >
                {generating ? (
                  <EcgLoader className="text-[#5eead4]" />
                ) : (
                  <FontAwesomeIcon icon={faRobot} className="w-4 h-4 text-[#5eead4]" />
                )}
                {generating ? "Generating…" : lesson ? "Generate from lesson" : "Generate"}
              </button>
              <button
                type="button"
                onClick={lessonImport.pick}
                disabled={generating}
                className="inline-flex items-center gap-2 px-4 py-2 bg-surface border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-all disabled:opacity-50"
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

          {/* Details */}
          <div className="rounded-xl border border-hairline bg-surface p-4 space-y-3 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            <div>
              <label className={labelClassName}>Title</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Hypoxia After Abdominal Surgery"
                className={inputClassName}
              />
            </div>
            <div>
              <label className={labelClassName}>Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="Brief overview of the patient case..."
                className={inputClassName + " resize-none"}
              />
            </div>
            <div>
              <label className={labelClassName}>Learning Objectives</label>
              <textarea
                value={form.learningObjectives}
                onChange={(e) => setForm({ ...form, learningObjectives: e.target.value })}
                rows={4}
                placeholder="One objective per line&#10;e.g. Measure SpO₂ with a pulse oximeter"
                className={inputClassName + " resize-none"}
              />
              <p className="text-xs text-gray-500 mt-1.5">Enter one objective per line.</p>
            </div>
          </div>

          <SkillPicker
            value={skills}
            onChange={setSkills}
            disabled={saving}
            detectInput={() => ({
              title: form.title,
              description: form.description,
              learning_objectives: form.learningObjectives
                .split("\n")
                .map((o) => o.trim())
                .filter(Boolean),
              patient_id: form.patientId || null,
              lesson_text: lesson?.lessonText ?? null,
            })}
          />
          {skills.length === 0 && (
            <p className="-mt-2 text-xs text-gray-500">
              Without skills, the patient case gets the general starter task list.
            </p>
          )}
        </div>

        {/* Right: patient + room tables */}
        <div className="space-y-4">
          {/* Patient table */}
          <div className="rounded-xl border border-hairline bg-surface overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            <div className="p-3 border-b border-hairline bg-subtle">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-gray-800">
                  Patient <span className="font-normal text-red-600">*</span>
                </span>
                {form.patientId ? (
                  <button
                    onClick={() => setForm((prev) => ({ ...prev, patientId: "", roomId: "" }))}
                    className="text-xs font-medium text-brand-700 hover:text-brand-900"
                  >
                    Clear
                  </button>
                ) : (
                  <span className="text-xs text-gray-500">Required — pick one below</span>
                )}
              </div>
              <div className="relative">
                <FontAwesomeIcon
                  icon={faSearch}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500"
                />
                <input
                  type="text"
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  placeholder="Search name, diagnosis, or room..."
                  className={inputClassName + " pl-10"}
                />
              </div>
            </div>
            <div className="max-h-[280px] overflow-y-auto custom-scrollbar">
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
                <table className="w-full">
                  <tbody className="divide-y divide-hairline">
                    {filteredPatients.map((patient) => {
                      const selected = form.patientId === patient.id;
                      return (
                        <tr
                          key={patient.id}
                          onClick={() => selectPatient(patient.id)}
                          className={`cursor-pointer transition-colors ${
                            selected ? "bg-brand-600/5" : "hover:bg-subtle"
                          }`}
                        >
                          <td className="py-2.5 px-3 w-8">
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                                selected
                                  ? "bg-brand-600 border-brand-600 text-white"
                                  : "border-gray-300"
                              }`}
                            >
                              {selected && <FontAwesomeIcon icon={faCheck} className="w-3 h-3" />}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="text-sm font-medium text-gray-800 truncate">
                              {patient.name}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {patient.diagnosis}
                            </p>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span className="text-xs text-gray-500">
                              {patient.room?.name ? `Room ${patient.room.room_number}` : "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Room table */}
          <div className="rounded-xl border border-hairline bg-surface overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
            <div className="p-3 border-b border-hairline bg-subtle flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800">Room</span>
              {form.roomId && (
                <button
                  onClick={() => setForm((prev) => ({ ...prev, roomId: "" }))}
                  className="text-xs font-medium text-brand-700 hover:text-brand-900"
                >
                  Clear
                </button>
              )}
            </div>
            {!form.patientId ? (
              <div className="p-6 text-center text-sm text-gray-500">
                Select a patient first to assign a room.
              </div>
            ) : (
              <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
                <table className="w-full">
                  <tbody className="divide-y divide-hairline">
                    {rooms.map((room) => {
                      const occ = occupancyByRoom.get(room.id) ?? 0;
                      const isCurrent = selectedPatient?.room_id === room.id;
                      const status = roomStatus(occ, room.capacity);
                      const disabled = status === "full" && !isCurrent;
                      const selected = form.roomId === room.id;
                      return (
                        <tr
                          key={room.id}
                          onClick={() =>
                            !disabled && setForm((prev) => ({ ...prev, roomId: room.id }))
                          }
                          className={`transition-colors ${
                            disabled
                              ? "opacity-50 cursor-not-allowed"
                              : selected
                                ? "bg-brand-600/5 cursor-pointer"
                                : "hover:bg-subtle cursor-pointer"
                          }`}
                        >
                          <td className="py-2.5 px-3 w-8">
                            <span
                              className={`flex h-5 w-5 items-center justify-center rounded-full border ${
                                selected
                                  ? "bg-brand-600 border-brand-600 text-white"
                                  : "border-gray-300"
                              }`}
                            >
                              {selected && <FontAwesomeIcon icon={faCheck} className="w-3 h-3" />}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <p className="text-sm font-medium text-gray-800 truncate flex items-center gap-2">
                              <FontAwesomeIcon icon={faDoorOpen} className="w-3.5 h-3.5 text-gray-400" />
                              {room.name}
                            </p>
                            <p className="text-xs text-gray-500">Room {room.room_number}</p>
                          </td>
                          <td className="py-2.5 px-3 text-right whitespace-nowrap">
                            <span className="text-xs text-gray-500 tabular-nums mr-2">
                              {occ}/{room.capacity}
                            </span>
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${ROOM_STATUS_TONE[status]}`}
                            >
                              {ROOM_STATUS_LABEL[status]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Save bar */}
      <div className="mt-4 flex items-center justify-end gap-3">
        <button
          onClick={() => router.push("/faculty/scenarios")}
          className="px-5 py-2.5 bg-surface border border-gray-200 hover:bg-gray-50 rounded-lg text-sm font-medium text-gray-700 transition-all"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !form.title.trim() || !form.patientId}
          title={!form.patientId ? "Select a patient first" : undefined}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white font-medium rounded-lg transition-colors shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
        >
          {saving ? (
            <EcgLoader />
          ) : (
            <FontAwesomeIcon icon={faSave} className="w-4 h-4" />
          )}
          {saving ? "Saving…" : "Save Patient Case"}
        </button>
      </div>

      {/* Reserved for a future "no rooms" hint; keeps the icon import meaningful. */}
      {rooms.length === 0 && !loadingData && (
        <p className="mt-2 text-xs text-gray-400 flex items-center gap-1.5">
          <FontAwesomeIcon icon={faTriangleExclamation} className="w-3 h-3" />
          No rooms exist yet — create them in Dean → Wards.
        </p>
      )}
    </div>
  );
}
