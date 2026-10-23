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
  faXmark,
  faUserPlus,
  faPenToSquare,
} from "@fortawesome/free-solid-svg-icons";
import {
  createScenario,
  generateAIScenario,
  fetchPatientRoster,
  fetchMyCourses,
  fetchRooms,
  updateFacultyPatient,
  getCurrentFacultyUser,
  logAuditAction,
  FacultyPatient,
  Room,
  type SkillSelection,
  fetchScenarioById,
  fetchScenarioSkillTasks,
  fetchFacultyScenarios,
  updateScenario,
  addScenarioSkills,
  removeScenarioTask,
} from "../../../lib/api";
import { DEFAULT_RUBRIC, resolveRubric, type Rubric } from "../../../lib/task-ratings";
import RubricEditor, { rubricToStore } from "../rubric-editor";
import SkillPicker from "../skill-picker";
import { roomStatus, ROOM_STATUS_LABEL, ROOM_STATUS_TONE } from "../../../lib/rooms";
import PageHeader from "../../../components/PageHeader";
import { usePageData } from "../../../lib/use-page-data";
import { EcgLoader } from "../../../components/EcgLoader";
import { SkeletonPatientPickRows } from "../../../components/skeletons";
import PatientFormModal from "../../../components/PatientFormModal";
import { termStatus } from "../../../lib/course-progress";
import { loadingToast, toast } from "../../../components/Toast";
import { forgetPage } from "../../../lib/request-cache";
import { LessonPanel, useLessonImport } from "../../../components/LessonImport";
import { ChapterTile, hueStyle } from "../library-plan";
import { TAYLORS_CHAPTERS } from "../../../../scripts/taylors-chapters";

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
  offeringId: "",
};

/**
 * Creates a patient case, or with `editId` edits one in the same layout. A case
 * already assigned to students can't be edited: what they were given stays
 * what they are graded on.
 */
export default function NewScenarioClient({ editId }: { editId?: string } = {}) {
  const router = useRouter();
  const editing = Boolean(editId);
  const [form, setForm] = useState(emptyForm);
  const [patientSearch, setPatientSearch] = useState("");

  const [aiPrompt, setAiPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPatientCase, setAiPatientCase] = useState<Record<string, unknown> | null>(null);
  const [aiGenerated, setAiGenerated] = useState(false);
  // Drafting with AI is optional, so it opens on its own rather than as a step.
  const [showAi, setShowAi] = useState(false);
  // The skill chapters the AI centres the case on; none lets it pick a core one.
  const [chapters, setChapters] = useState<number[]>([]);
  // An imported lesson grounds the AI draft (the prompt then just steers it),
  // and its ticked chapters replace the chapter picker.
  const lessonImport = useLessonImport();
  const { lesson, analyzing, selectedTopics, lessonText } = lessonImport;
  // A lesson's ticked taught chapters, and its ticked topics outside them.
  const lessonChapters = selectedTopics.flatMap((t) => (t.chapter === null ? [] : [t.chapter]));
  const lessonNewTopics = selectedTopics.filter((t) => t.chapter === null).map((t) => t.category);

  const [skills, setSkills] = useState<SkillSelection[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Editing: the case as saved, its skill tasks (by skill) and its other tasks.
  const { data: editData, loading: loadingEdit } = usePageData(editId ? `faculty:scenario-edit:${editId}` : null, async () => {
    const [scenario, tasks, roster, list] = await Promise.all([
      fetchScenarioById(editId!),
      fetchScenarioSkillTasks(editId!),
      fetchPatientRoster(),
      fetchFacultyScenarios(),
    ]);
    return {
      scenario,
      tasks: tasks ?? [],
      patientRoom: roster.patients.find((p) => p.id === scenario?.patient_id)?.room_id ?? "",
      assigned: list.find((x) => x.id === editId)?.student_count ?? 0,
    };
  });
  const [rubric, setRubric] = useState<Rubric>(DEFAULT_RUBRIC);
  // Starter (non-skill) tasks marked for removal, removed on save.
  const [removedTasks, setRemovedTasks] = useState<string[]>([]);
  const [filledFor, setFilledFor] = useState<string | null>(null);
  const editScenario = editData?.scenario ?? null;
  const originalTaskBySkill = useMemo(
    () => new Map((editData?.tasks ?? []).flatMap((t) => (t.skill_id ? [[t.skill_id, t.id] as const] : []))),
    [editData?.tasks],
  );
  const otherTasks = (editData?.tasks ?? []).filter((t) => !t.skill_id);
  // The form starts from the saved case, once it has loaded.
  if (editId && editScenario && filledFor !== editId) {
    setFilledFor(editId);
    setForm({
      title: editScenario.title,
      description: editScenario.description ?? "",
      learningObjectives: (editScenario.learning_objectives ?? []).join("\n"),
      patientId: editScenario.patient_id ?? "",
      roomId: editData?.patientRoom ?? "",
      offeringId: editScenario.offering_id ?? "",
    });
    setSkills([...originalTaskBySkill.keys()].map((id) => ({ id })));
    setRubric(resolveRubric(editScenario.rubric));
  }

  const {
    data,
    loading: loadingData,
    refresh: reloadRefs,
  } = usePageData("faculty:scenario-form-refs", async () => {
    const [roster, rooms, mine] = await Promise.all([fetchPatientRoster(), fetchRooms(), fetchMyCourses()]);
    // A case is made for one of the instructor's courses that hasn't ended.
    const offerings = (mine.data?.offerings ?? []).filter((o) => termStatus(o.term) !== "ended");
    return { patients: roster.patients, courses: roster.courses, coursesEnabled: roster.coursesEnabled, rooms, offerings };
  });
  const [addingPatient, setAddingPatient] = useState(false);

  const offerings = useMemo(() => data?.offerings ?? [], [data?.offerings]);
  // With a single course there is nothing to choose.
  const offeringId = form.offeringId || (offerings.length === 1 ? offerings[0].id : "");
  const offering = offerings.find((o) => o.id === offeringId) ?? null;
  const allPatients = data?.patients ?? NO_PATIENTS;
  // A course's cases are built on that course's patients.
  const patients = useMemo(
    () =>
      offering && data?.coursesEnabled
        ? allPatients.filter((p) => (p.course_ids ?? []).includes(offering.course.id))
        : allPatients,
    [allPatients, offering, data?.coursesEnabled],
  );
  const rooms = data?.rooms ?? NO_ROOMS;
  const courseCode = useMemo(
    () => new Map((data?.courses ?? []).map((c) => [c.id, c.code])),
    [data?.courses],
  );

  /** A patient added from here is picked for the case straight away. */
  const handlePatientAdded = async (patient: FacultyPatient) => {
    setAddingPatient(false);
    await reloadRefs();
    setPatientSearch("");
    setForm((prev) => ({ ...prev, patientId: patient.id, roomId: patient.room_id ?? "" }));
    toast(`${patient.name} added to your patients`);
  };

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
      lessonText,
      chapters: lesson ? lessonChapters : chapters,
      topics: lesson ? lessonNewTopics : [],
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
      setShowAi(false);
      toast("Draft filled in. Review the details and skills before saving.");
    }
    setGenerating(false);
  };

  const handleSave = async () => {
    if (!form.title.trim()) {
      setError("Title is required.");
      return;
    }
    if (offerings.length > 0 && !offeringId) {
      setError("Choose the course this patient case is for.");
      return;
    }
    if (!form.patientId) {
      setError("Select a patient for this patient case before saving.");
      return;
    }
    if (!form.roomId) {
      setError("Choose the room the patient is in.");
      return;
    }
    setSaving(true);
    setError(null);
    const progress = loadingToast(`Saving ${form.title.trim()}…`);

    if (editId) {
      await saveEdit(progress);
      return;
    }

    const newScenario = await createScenario({
      title: form.title,
      description: form.description,
      patient_id: form.patientId || null,
      ...(offeringId ? { offering_id: offeringId } : {}),
      learning_objectives: form.learningObjectives
        .split("\n")
        .map((o) => o.trim())
        .filter(Boolean),
      ...(aiGenerated ? { patient_case: aiPatientCase ?? {}, is_ai_generated: true } : {}),
      skills,
    });

    if (!newScenario) {
      setError("Unable to create patient case. Please try again.");
      progress.error("Unable to create the patient case");
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

    progress.success(`${newScenario.title} saved`);
    // Back to the list, loaded fresh so the new case is there from the first
    // frame; Back won't reopen the form.
    forgetPage("faculty:scenarios");
    router.replace("/faculty/scenarios");
  };

  const objectives = form.learningObjectives
    .split("\n")
    .map((o) => o.trim())
    .filter(Boolean);

  /** Saves an edit: the details, then the skills that changed, then the room. */
  const saveEdit = async (progress: ReturnType<typeof loadingToast>) => {
    const savedRubric = resolveRubric(editScenario?.rubric);
    const rubricChanged = JSON.stringify(rubricToStore(rubric)) !== JSON.stringify(rubricToStore(savedRubric));
    const updated = await updateScenario(editId!, {
      title: form.title,
      description: form.description,
      patient_id: form.patientId,
      learning_objectives: objectives,
      ...(offerings.length > 0 ? { offering_id: offeringId } : {}),
      ...(rubricChanged ? { rubric: rubricToStore(rubric) } : {}),
    });
    if (!updated) {
      setError("Unable to save the patient case. You can only edit patient cases you created.");
      progress.error("Unable to save the patient case");
      setSaving(false);
      return;
    }

    // A skill removed, or one whose route or steps changed, loses its task;
    // the changed and new ones are added back as they now stand.
    const picked = new Map(skills.map((sk) => [sk.id, sk]));
    const remove = [
      ...[...originalTaskBySkill].filter(([skillId]) => {
        const sel = picked.get(skillId);
        return !sel || sel.sections !== undefined || sel.skipped !== undefined;
      }).map(([, taskId]) => taskId),
      ...removedTasks,
    ];
    const add = skills.filter(
      (sk) => !originalTaskBySkill.has(sk.id) || sk.sections !== undefined || sk.skipped !== undefined,
    );
    const removed = await Promise.all(remove.map((taskId) => removeScenarioTask(editId!, taskId)));
    const added = add.length > 0 ? await addScenarioSkills(editId!, add) : { added: 0 };
    if (removed.includes(false) || "error" in added) {
      setError("The details were saved, but some skills weren't updated. Open the case again to check its skills.");
      progress.error("Some skills weren't updated");
      setSaving(false);
      return;
    }

    if (form.patientId && form.roomId && selectedPatient && selectedPatient.room_id !== form.roomId) {
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

    const faculty = getCurrentFacultyUser();
    if (faculty) {
      logAuditAction({
        faculty_id: faculty.id,
        faculty_name: faculty.name,
        tab: "scenarios",
        action: "update_scenario",
        details: `Updated patient case: ${updated.title}`,
        target_type: "scenario",
        target_id: editId!,
        metadata: { scenario_title: updated.title },
      });
    }

    progress.success(`${updated.title} saved`);
    forgetPage("faculty:scenarios");
    forgetPage(`faculty:scenario-edit:${editId}`);
    router.replace("/faculty/scenarios");
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
  const chapterFocus = lesson ? lessonChapters : chapters;
  // The chapters the case's skills come from ("1-6" is Chapter 1), for the summary.
  const skillChapters = [...new Set(skills.map((s) => Number(s.id.split("-")[0])))].sort((a, b) => a - b);
  const canGenerate =
    !generating && !analyzing && !!form.patientId && (!!aiPrompt.trim() || !!lesson);
  const ready = !!form.title.trim() && !!form.patientId && !!form.roomId && (offerings.length === 0 || !!offeringId);

  const backButton = (
    <button
      onClick={() => router.push("/faculty/scenarios")}
      className="mb-4 inline-flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-brand-700 transition-colors"
    >
      <FontAwesomeIcon icon={faArrowLeft} className="w-3.5 h-3.5" />
      Back to patient cases
    </button>
  );
  const editHeader = (title: string, subtitle: string) => (
    <PageHeader
      badge={{ icon: <FontAwesomeIcon icon={faPenToSquare} className="w-3.5 h-3.5" />, label: "Edit Patient Case" }}
      title={title}
      subtitle={subtitle}
    />
  );
  if (editing && (loadingEdit || !editData)) {
    return (
      <div className="pb-4">
        {editHeader("Edit Patient Case", "Loading the patient case…")}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <EcgLoader className="text-brand-600" /> Loading…
        </div>
      </div>
    );
  }
  if (editing && !editScenario) {
    return (
      <div className="pb-4">
        {editHeader("Patient case not found", "It may have been deleted by someone else.")}
        {backButton}
      </div>
    );
  }
  if (editing && editScenario && (editData?.assigned ?? 0) > 0) {
    const n = editData?.assigned ?? 0;
    return (
      <div className="pb-4">
        {editHeader(editScenario.title, "This patient case can't be edited.")}
        {backButton}
        <div className="flex max-w-xl items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <FontAwesomeIcon icon={faLock} className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            It&apos;s assigned to {n} student{n === 1 ? "" : "s"}, so its details and skills stay as they were
            given. To change it, make a new patient case instead.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-4">
      {editing && editScenario ? (
        editHeader(editScenario.title, "Change the patient, room, details and skills, then save.")
      ) : (
        <PageHeader
          badge={{
            icon: <FontAwesomeIcon icon={faRobot} className="w-3.5 h-3.5" />,
            label: "New Patient Case",
          }}
          title="Create Patient Case"
          subtitle="Build a clinical case by hand, or generate one with AI and edit it"
        />
      )}

      {backButton}

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
            {offerings.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500">Course</p>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Course">
                  {offerings.map((o) => {
                    const on = o.id === offeringId;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        onClick={() =>
                          setForm((prev) => {
                            // A patient from another course doesn't carry over.
                            const keep = allPatients.find((p) => p.id === prev.patientId);
                            const fits = !data?.coursesEnabled || (keep?.course_ids ?? []).includes(o.course.id);
                            return { ...prev, offeringId: o.id, ...(fits ? {} : { patientId: "", roomId: "" }) };
                          })
                        }
                        className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                          on
                            ? "border-brand-600 bg-brand-600 text-white"
                            : "border-gray-300 bg-surface text-gray-700 hover:border-brand-600/50"
                        }`}
                      >
                        {on && <FontAwesomeIcon icon={faCheck} className="h-3 w-3" />}
                        <span className="font-semibold">{o.course.code}</span>
                        <span className={on ? "text-white/80" : "text-gray-500"}>{o.course.title}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1.5 text-xs text-gray-500">
                  The case counts toward this course&apos;s grading once you assign it.
                </p>
              </div>
            )}
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
                <div className="flex items-center gap-2 border-b border-hairline bg-subtle p-2">
                  <div className="relative flex-1">
                    <FontAwesomeIcon
                      icon={faSearch}
                      className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500"
                    />
                    <input
                      type="text"
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                      placeholder="Search name, diagnosis, or room..."
                      className={inputClassName + " pl-9"}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => setAddingPatient(true)}
                    className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-brand-700 transition-colors"
                  >
                    <FontAwesomeIcon icon={faUserPlus} className="h-3.5 w-3.5" />
                    Add patient
                  </button>
                </div>
                <div className="max-h-[300px] overflow-y-auto custom-scrollbar">
                  {loadingData ? (
                    <SkeletonPatientPickRows />
                  ) : filteredPatients.length === 0 ? (
                    <div className="p-6 text-center text-sm text-gray-500">
                      {patients.length === 0
                        ? "No patients in your courses yet. Add one to build this case around."
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
                            {(patient.course_ids ?? []).length > 0 && (
                              <span className="hidden shrink-0 gap-1 sm:flex">
                                {(patient.course_ids ?? [])
                                  .map((id) => courseCode.get(id))
                                  .filter(Boolean)
                                  .map((code) => (
                                    <span
                                      key={code}
                                      className="rounded-full bg-brand-600/10 px-2 py-0.5 text-[11px] font-semibold text-brand-700"
                                    >
                                      {code}
                                    </span>
                                  ))}
                              </span>
                            )}
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
            tag={<span className="text-xs font-semibold text-red-600">Required</span>}
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
                No rooms exist yet. Your Dean or Program Chair creates them under Wards.
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

          {/* 03 — Details */}
          <SheetStep
            n={3}
            title="Case details"
            done={!!form.title.trim()}
            hint={
              editing
                ? undefined
                : aiGenerated
                  ? "Filled in by AI — review and edit before saving."
                  : "Write the case yourself, or use Draft with AI on the right."
            }
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

          {/* 04 — Skills */}
          <SheetStep
            n={4}
            title="Skills"
            done={skills.length > 0}
            last={!editing}
            hint={
              skills.length === 0
                ? "Without skills, the patient case gets the general starter task list."
                : undefined
            }
          >
            <SkillPicker
              focusChapters={chapterFocus}
              value={skills}
              onChange={setSkills}
              disabled={saving}
              detectInput={() => ({
                title: form.title,
                description: form.description,
                learning_objectives: objectives,
                patient_id: form.patientId || null,
                lesson_text: lessonText ?? null,
              })}
            />
            {otherTasks.filter((t) => !removedTasks.includes(t.id)).length > 0 && (
              <div className="mt-3 rounded-xl border border-hairline p-3">
                <p className="text-sm font-semibold text-gray-800">Other tasks</p>
                <p className="text-xs text-gray-500">Tasks not from a Taylor&apos;s skill. Remove any you no longer want.</p>
                <ul className="mt-2 space-y-1">
                  {otherTasks
                    .filter((t) => !removedTasks.includes(t.id))
                    .map((t) => (
                      <li key={t.id} className="flex items-center gap-2 rounded-lg bg-subtle px-3 py-1.5 text-sm text-gray-800">
                        <span className="min-w-0 flex-1 truncate">{t.title}</span>
                        <button
                          type="button"
                          onClick={() => setRemovedTasks((prev) => [...prev, t.id])}
                          aria-label={`Remove ${t.title}`}
                          className="grid h-6 w-6 place-items-center rounded-md text-gray-500 hover:bg-red-50 hover:text-red-600"
                        >
                          <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                </ul>
              </div>
            )}
          </SheetStep>

          {editing && (
            <SheetStep
              n={5}
              title="Rating wording"
              last
              hint="Optional. Your own words for each rating level; blank ones use the book's."
            >
              <RubricEditor value={rubric} onChange={setRubric} />
            </SheetStep>
          )}
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
                  { label: "Chapters", value: skillChapters.length },
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
              {skillChapters.length > 0 && (
                <div className="flex flex-wrap gap-1.5 px-4 py-2.5">
                  {skillChapters.map((c) => (
                    <span
                      key={c}
                      style={hueStyle(c)}
                      title={TAYLORS_CHAPTERS.find((x) => x.chapter === c)?.name}
                      className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_srgb,var(--hue)_35%,transparent)] bg-[color-mix(in_srgb,var(--hue)_8%,transparent)] px-2 py-0.5 text-[11px] font-medium text-gray-700"
                    >
                      <span className="h-2 w-2 rounded-sm bg-[var(--hue)]" />
                      Ch. {c} · {skills.filter((s) => s.id.startsWith(`${c}-`)).length}
                    </span>
                  ))}
                </div>
              )}
            </dl>
          </div>

          {!editing && (
          <div className="rounded-2xl border border-brand-200 bg-[linear-gradient(160deg,var(--color-brand-50),transparent_75%)] p-4 shadow-tile">
            <p className="text-sm font-semibold text-gray-900">Draft with AI</p>
            <p className="mt-0.5 text-xs text-gray-600">
              Optional. Describe the case or import a lesson, and AI fills in the details and skills for you to edit.
            </p>
            <button
              type="button"
              onClick={() => setShowAi(true)}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-brand-600/40 bg-surface px-4 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-600/5"
            >
              <FontAwesomeIcon icon={faWandMagicSparkles} className="h-4 w-4" />
              {aiGenerated ? "Draft again with AI" : "Draft with AI"}
            </button>
          </div>
          )}

          <div className="rounded-2xl border border-hairline bg-surface p-4 shadow-tile">
            <ul className="space-y-1.5 text-xs">
              {[
                ...(offerings.length > 0 ? [{ ok: !!offeringId, label: "Course chosen" }] : []),
                { ok: !!form.patientId, label: "Patient chosen" },
                { ok: !!form.roomId, label: "Room chosen" },
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
              title={!form.patientId ? "Select a patient first" : !form.roomId ? "Choose a room first" : undefined}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 px-5 py-2.5 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
            >
              {saving ? <EcgLoader /> : <FontAwesomeIcon icon={faSave} className="w-4 h-4" />}
              {saving ? "Saving…" : editing ? "Save changes" : "Save Patient Case"}
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
      {showAi && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={generating ? undefined : () => setShowAi(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-draft-title"
            className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline bg-subtle px-5 py-3">
              <div>
                <h2 id="ai-draft-title" className="font-display text-lg font-semibold text-gray-900">
                  Draft with AI
                </h2>
                <p className="text-sm text-gray-500">
                  AI fills the details and picks the skills; everything stays editable.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAi(false)}
                disabled={generating}
                aria-label="Close"
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
              >
                <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
              </button>
            </div>
            <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto p-5">
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
                  <div className="flex items-baseline justify-between gap-2">
                    <p className={labelClassName}>Skill chapters</p>
                    {chapters.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setChapters([])}
                        disabled={generating}
                        className="text-[11px] font-medium text-brand-700 hover:text-brand-900"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 2xl:grid-cols-4 gap-1.5 max-h-[248px] overflow-y-auto custom-scrollbar p-px">
                    {TAYLORS_CHAPTERS.map((c) => (
                      <ChapterTile
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
                      ? "None selected — AI centres the case on whichever core chapter fits the patient."
                      : `The case centres on ${chapters.length === 1 ? "Chapter" : "Chapters"} ${chapters
                          .slice()
                          .sort((a, b) => a - b)
                          .join(", ")}.`}
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
                  The case centres on the ticked chapters and topics and applies the lesson.
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
            </div>
          </div>
        </div>
      )}
      {addingPatient && (
        <PatientFormModal
          patient={null}
          rooms={rooms}
          courses={data?.courses ?? []}
          coursesEnabled={data?.coursesEnabled ?? false}
          initialCourseIds={offering ? [offering.course.id] : undefined}
          onClose={() => setAddingPatient(false)}
          onSaved={(patient) => void handlePatientAdded(patient)}
        />
      )}
    </div>
  );
}
