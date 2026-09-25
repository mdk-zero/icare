"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faLayerGroup,
  faChevronRight,
  faArrowLeft,
  faXmark,
  faTrashCan,
  faCircleCheck,
  faUsers,
  faTriangleExclamation,
  faSearch,
  faPenToSquare,
  faFolderPlus,
  faBrain,
  faUserPlus,
  faFolderOpen,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../components/PageHeader";
import FilterSelect from "../../components/FilterSelect";
import StatTile from "../../components/StatTile";
import ConfirmModal from "../../components/ConfirmModal";
import {
  fetchSections,
  fetchFacultyTeams,
  moveStudentToTeam,
  runMlJob,
  Section,
  apiFetch,
} from "../../lib/api";
import { usePageData } from "../../lib/use-page-data";
import Avatar from "../../components/Avatar";
import { EcgLoader } from "../../components/EcgLoader";
import MlRunProgress, {
  type MlRun,
  mlRunFraction,
  mlRunLabel,
} from "../../components/MlRunProgress";
import { loadingToast, toast } from "../../components/Toast";
import SectionGroups from "./SectionGroups";
import RegisterStudentModal from "./RegisterStudentModal";
import BulkEnrollModal from "./BulkEnrollModal";
import { isStudentDrag, leftTarget, readStudentDrag, startStudentDrag } from "./drag";

/** The run summary is a couple of sentences; the default toast is gone before it can be read. */
const ML_TOAST_MS = 8000;

interface StudentPerformance {
  id: string;
  name: string;
  email: string;
  picture_url: string | null;
  sex: "male" | "female" | null;
  quizzes_completed: number;
  average_score: number | null;
  at_risk: boolean;
  last_login_at: string | null;
  /** When the account was made, i.e. when they were enrolled. */
  created_at: string;
  section_id: string | null;
  section: string | null;
}

// Stable empty fallbacks, so the grouping memos are not invalidated every render.
const NO_STUDENTS: StudentPerformance[] = [];
const NO_SECTIONS: Section[] = [];

/** Group key for students with no section assigned. */
const UNASSIGNED_KEY = "__unassigned__";

function formatLastActive(value: string | null): string {
  if (!value) return "Never";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Create or rename a section. Renaming is safe from the admin's point of view —
 * the API carries the new name over to any assessment aimed at this section.
 */
function SectionFormModal({
  section,
  existingNames,
  onClose,
  onSaved,
}: {
  section: Section | null;
  existingNames: string[];
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [name, setName] = useState(section?.name ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = name.trim();
  const isDuplicate =
    trimmed.length > 0 &&
    existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase() && n !== section?.name);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trimmed) {
      setError("Section name is required.");
      return;
    }
    if (isDuplicate) {
      setError(`A section named "${trimmed}" already exists.`);
      return;
    }
    setSaving(true);
    setError(null);
    const progress = loadingToast(section ? `Renaming ${section.name} to ${trimmed}…` : `Creating ${trimmed}…`);

    const res = await fetch(section ? `/api/admin/sections/${section.id}` : "/api/admin/sections", {
      method: section ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: trimmed }),
    });
    const json = (await res.json()) as {
      section?: Section;
      assessments_retargeted?: number;
      error?: string;
    };
    setSaving(false);

    if (!res.ok || !json.section) {
      progress.error(json.error ?? "Something went wrong. Try again.");
      setError(json.error ?? "Something went wrong. Try again.");
      return;
    }
    progress.success(section ? `Renamed to ${trimmed}` : `Created ${trimmed}`);

    if (section) {
      const moved = json.assessments_retargeted ?? 0;
      onSaved(
        `Section renamed to "${trimmed}"` +
          (moved > 0
            ? ` — ${moved} assessment${moved === 1 ? "" : "s"} now target the new name.`
            : "."),
      );
    } else {
      onSaved(`Section "${trimmed}" created.`);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={saving ? undefined : onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline bg-subtle px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/10">
              <FontAwesomeIcon
                icon={section ? faPenToSquare : faFolderPlus}
                className="h-5 w-5 text-brand-600"
              />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold text-gray-900">
                {section ? "Rename section" : "New section"}
              </h2>
              <p className="text-sm text-gray-500">
                {section
                  ? `Currently “${section.name}”`
                  : "Sections group students and their faculty"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 p-5">
          <div>
            <label
              htmlFor="section-name"
              className="mb-1.5 block text-sm font-semibold text-gray-700"
            >
              Section name <span className="text-rose-500">*</span>
            </label>
            <input
              id="section-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
              maxLength={50}
              autoFocus
              placeholder="e.g. BSN 3-A"
              className="w-full rounded-xl border border-gray-300 bg-surface px-4 py-2.5 text-gray-900 transition-all placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-60"
            />
            {isDuplicate && (
              <p className="mt-1.5 text-xs text-amber-600">
                A section named &ldquo;{trimmed}&rdquo; already exists.
              </p>
            )}
          </div>

          {section && (
            <p className="rounded-lg border border-hairline bg-subtle p-2.5 text-xs text-gray-500">
              Students and faculty stay attached. Assessments aimed at this section are updated to
              the new name automatically.
            </p>
          )}

          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-200 bg-surface px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !trimmed || isDuplicate}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700 disabled:opacity-60"
            >
              {saving && <EcgLoader />}
              {section ? "Save name" : "Create section"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

interface SectionImpact {
  student_count: number;
  faculty: { id: string; name: string }[];
  assessment_count: number;
}

/**
 * Deletion is destructive in ways that aren't visible from the roster alone, so
 * the modal loads what is attached before offering the button.
 */
function DeleteSectionModal({
  section,
  onClose,
  onDeleted,
}: {
  section: Section;
  onClose: () => void;
  onDeleted: (message: string) => void;
}) {
  const [impact, setImpact] = useState<SectionImpact | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // The blast radius lives in the database, so it can only arrive after mount.
    void apiFetch(`/api/admin/sections/${section.id}`, { credentials: "include" })
      .then((res) => (res.ok ? (res.json() as Promise<SectionImpact>) : null))
      .then((json) => {
        if (json) setImpact(json);
      });
  }, [section.id]);

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    const progress = loadingToast(`Deleting ${section.name}…`);
    const res = await apiFetch(`/api/admin/sections/${section.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const json = (await res.json()) as { unassigned_students?: number; error?: string };
    setDeleting(false);
    if (!res.ok) {
      progress.error(json.error ?? "Unable to delete section.");
      setError(json.error ?? "Unable to delete section.");
      return;
    }
    progress.success(`${section.name} deleted`);
    const freed = json.unassigned_students ?? 0;
    onDeleted(
      `Section "${section.name}" deleted` +
        (freed > 0 ? ` — ${freed} student${freed === 1 ? " is" : "s are"} now unassigned.` : "."),
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={deleting ? undefined : onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-hairline bg-subtle px-5 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-rose-100">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-5 w-5 text-rose-600" />
          </span>
          <div>
            <h2 className="font-display text-lg font-semibold text-gray-900">
              Delete section {section.name}?
            </h2>
            <p className="text-sm text-gray-500">This cannot be undone.</p>
          </div>
        </div>

        <div className="space-y-3 p-5">
          {impact === null ? (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <EcgLoader />
              Checking what is attached…
            </p>
          ) : (
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-start gap-2.5">
                <FontAwesomeIcon
                  icon={faUsers}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400"
                />
                <span>
                  {impact.student_count === 0 ? (
                    "No students are enrolled here."
                  ) : (
                    <>
                      <strong className="font-semibold">
                        {impact.student_count} student{impact.student_count === 1 ? "" : "s"}
                      </strong>{" "}
                      become unassigned. Their accounts, attempts and scores are kept.
                    </>
                  )}
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <FontAwesomeIcon
                  icon={faLayerGroup}
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gray-400"
                />
                <span>
                  {impact.faculty.length === 0 ? (
                    "No faculty member handles this section."
                  ) : (
                    <>
                      Removed from{" "}
                      <strong className="font-semibold">
                        {impact.faculty.map((f) => f.name).join(", ")}
                      </strong>
                      .
                    </>
                  )}
                </span>
              </li>
              {impact.assessment_count > 0 && (
                <li className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-800">
                  <FontAwesomeIcon
                    icon={faTriangleExclamation}
                    className="mt-0.5 h-3.5 w-3.5 shrink-0"
                  />
                  {/* Built as one string: JSX drops the space at an
                      expression/text boundary that straddles a line break. */}
                  <span>
                    {impact.assessment_count === 1
                      ? `1 assessment is published to “${section.name}” and will reach nobody. Retarget it first if the cohort still needs it.`
                      : `${impact.assessment_count} assessments are published to “${section.name}” and will reach nobody. Retarget them first if the cohort still needs them.`}
                  </span>
                </li>
              )}
            </ul>
          )}

          {error && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">
              {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={deleting}
              className="rounded-lg border border-gray-200 bg-surface px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
            >
              Keep section
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="flex items-center gap-2 rounded-lg bg-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(225_29_72_/_0.35)] transition-all hover:bg-rose-700 disabled:opacity-60"
            >
              {deleting && <EcgLoader />}
              {deleting ? "Deleting…" : "Delete section"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface SectionGroup {
  key: string;
  name: string;
  students: StudentPerformance[];
}

export default function StudentManagementClient() {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  // `section: null` is the create form; a section is the rename form.
  const [sectionForm, setSectionForm] = useState<{ section: Section | null } | null>(null);
  const [sectionToDelete, setSectionToDelete] = useState<Section | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [bulkEnrolling, setBulkEnrolling] = useState(false);
  // Lit while a grouped student is dragged over the table, to take them out of their group.
  const [tableDropActive, setTableDropActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmingBatchDelete, setConfirmingBatchDelete] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDeleteError, setBatchDeleteError] = useState<string | null>(null);

  // On-demand ML runs across the whole cohort.
  const [mlRun, setMlRun] = useState<MlRun | null>(null);
  const runningMl = mlRun !== null;

  // Sections carry names into the roster, so the two load and refresh together.
  const { data, loading, refresh } = usePageData("admin:student-management", async () => {
    const [studentsRes, sections] = await Promise.all([
      apiFetch("/api/admin/students", { credentials: "include" }),
      fetchSections(),
    ]);
    const students = studentsRes.ok
      ? (((await studentsRes.json()) as { students?: StudentPerformance[] }).students ??
        NO_STUDENTS)
      : NO_STUDENTS;
    return { students, sections };
  });

  // Groups within each section, with their faculty; reloaded after every change.
  const { data: teamsOverview, refresh: refreshTeams } = usePageData(
    "admin:student-management:groups",
    fetchFacultyTeams,
  );

  const students = data?.students ?? NO_STUDENTS;
  const sections = data?.sections ?? NO_SECTIONS;
  const loadStudents = refresh;
  const loadSections = refresh;

  /**
   * Runs both jobs, prediction first so the recommender sees fresh risk
   * scores. Stops at the first failure rather than reporting a half-run.
   *
   * The roster is reloaded afterwards, because the at-risk counts above and
   * the flag on every row are what this has just rewritten.
   */
  const handleRunMl = async () => {
    setMlRun({ job: "predict", fraction: 0 });

    const predictions = await runMlJob("predict", (fraction) =>
      setMlRun({ job: "predict", fraction }),
    );
    if (predictions.error) {
      toast(predictions.error, "error", ML_TOAST_MS);
      setMlRun(null);
      return;
    }
    setMlRun({ job: "recommend", fraction: 0 });
    const recommendations = await runMlJob("recommend", (fraction) =>
      setMlRun({ job: "recommend", fraction }),
    );
    if (recommendations.error) {
      toast(recommendations.error, "error", ML_TOAST_MS);
      setMlRun(null);
      return;
    }

    const scored = Number(predictions.result?.scored ?? 0);
    const atRisk = Number(predictions.result?.at_risk ?? 0);
    const recs = Number(recommendations.result?.recommendations ?? 0);
    toast(
      `Scored ${scored} student${scored === 1 ? "" : "s"} (${atRisk} at risk) and wrote ${recs} ` +
        `recommendation${recs === 1 ? "" : "s"}. Run Refresh Warehouse on Analytics to fold the ` +
        "new predictions into the charts.",
      "success",
      ML_TOAST_MS,
    );
    setMlRun(null);
    await refresh();
  };

  /** Sections carry names into the roster, so both lists refresh together. */
  const refreshAfterSectionChange = useCallback(
    (message: string) => {
      setNotice(message);
      setSectionForm(null);
      setSectionToDelete(null);
      void loadSections();
      void loadStudents();
    },
    [loadSections, loadStudents],
  );

  /** Provisions one account into a section; returns an error message or null. */
  const filteredStudents = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return students.filter((s) => {
      const matchesSearch =
        !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
      const matchesFilter =
        filterStatus === "all" ||
        (filterStatus === "at-risk" && s.at_risk) ||
        (filterStatus === "safe" && !s.at_risk);
      return matchesSearch && matchesFilter;
    });
  }, [students, searchQuery, filterStatus]);

  const groups = useMemo<SectionGroup[]>(() => {
    const matching = new Set(filteredStudents.map((s) => s.id));
    const byKey = new Map<string, SectionGroup>();
    for (const section of sections) {
      byKey.set(section.id, { key: section.id, name: section.name, students: [] });
    }
    for (const student of students) {
      const key = student.section_id ?? UNASSIGNED_KEY;
      let group = byKey.get(key);
      if (!group) {
        group = { key, name: student.section ?? "Unassigned", students: [] };
        byKey.set(key, group);
      }
      if (matching.has(student.id)) group.students.push(student);
    }
    return [...byKey.values()].sort((a, b) => {
      if (a.key === UNASSIGNED_KEY) return 1;
      if (b.key === UNASSIGNED_KEY) return -1;
      return a.name.localeCompare(b.name);
    });
  }, [sections, students, filteredStudents]);

  const openGroup = groups.find((g) => g.key === selectedSection) ?? null;
  const isRealSection = !!openGroup && openGroup.key !== UNASSIGNED_KEY;

  // Once a section has groups, its table lists only the students left out of
  // every group; the grouped ones are shown in their group cards above.
  const sectionGroups = useMemo(
    () =>
      isRealSection
        ? (teamsOverview?.teams ?? [])
            .filter((t) => t.section_id === openGroup.key)
            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        : [],
    [teamsOverview, isRealSection, openGroup],
  );
  const hasGroups = sectionGroups.length > 0;
  const tableStudents = useMemo(() => {
    if (!openGroup) return NO_STUDENTS;
    if (!hasGroups) return openGroup.students;
    const grouped = new Set(sectionGroups.flatMap((g) => g.members.map((m) => m.id)));
    return openGroup.students.filter((s) => !grouped.has(s.id));
  }, [openGroup, hasGroups, sectionGroups]);

  // Word-style picking in the table: click selects one row (or unselects it
  // if it's already picked), Ctrl/Cmd+click adds or removes a row, and
  // Shift+click selects the run from the last pick. Escape clears it all.
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const selectRow = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && anchorId) {
      const ids = tableStudents.map((s) => s.id);
      const [from, to] = [ids.indexOf(anchorId), ids.indexOf(id)].sort((x, y) => x - y);
      if (from >= 0) {
        setSelectedIds(new Set(ids.slice(from, to + 1)));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey || selectedIds.has(id)) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      });
    } else {
      setSelectedIds(new Set([id]));
    }
    setAnchorId(id);
  };

  /** Leaving a roster drops its selection, so nothing carries into the next one. */
  const openSection = (key: string | null) => {
    setSelectedSection(key);
    setSelectedIds(new Set());
  };

  // Only rows currently on screen count as selected: narrowing the search after
  // ticking boxes must not delete students the admin can no longer see.
  const selectedStudents = useMemo(
    () => tableStudents.filter((s) => selectedIds.has(s.id)),
    [tableStudents, selectedIds],
  );
  const visibleCount = tableStudents.length;
  const allVisibleSelected = visibleCount > 0 && selectedStudents.length === visibleCount;

  useEffect(() => {
    if (selectedIds.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedIds(new Set());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedIds]);

  const toggleStudent = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const toggleAllVisible = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const student of tableStudents) {
        if (allVisibleSelected) next.delete(student.id);
        else next.add(student.id);
      }
      return next;
    });

  const handleBatchDelete = async () => {
    setBatchDeleting(true);
    setBatchDeleteError(null);
    const count = selectedStudents.length;
    const progress = loadingToast(`Deleting ${count} student${count === 1 ? "" : "s"}…`);
    const res = await apiFetch("/api/admin/students", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ids: selectedStudents.map((s) => s.id) }),
    });
    const json = (await res.json()) as { deleted?: number; error?: string };
    if (!res.ok) {
      setBatchDeleting(false);
      progress.error(json.error ?? "Unable to delete the selected students.");
      setBatchDeleteError(json.error ?? "Unable to delete the selected students.");
      return;
    }
    const deleted = json.deleted ?? 0;
    await loadStudents();
    await refreshTeams();
    setBatchDeleting(false);
    progress.success(`Deleted ${deleted} student${deleted === 1 ? "" : "s"}`);
    setConfirmingBatchDelete(false);
    setSelectedIds(new Set());
    setNotice(
      `${deleted} student${deleted === 1 ? "" : "s"} deleted — their attempts and scores are gone too.`,
    );
  };

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3" />,
          label: "Student Management",
        }}
        title="Students"
        subtitle="Enroll and monitor nursing students by section"
        action={{
          icon: runningMl ? (
            <EcgLoader />
          ) : (
            <FontAwesomeIcon icon={faBrain} className="h-4 w-4" />
          ),
          onClick: handleRunMl,
          text: mlRun ? `${Math.round(mlRunFraction(mlRun) * 100)}%` : "",
          disabled: runningMl,
          label: mlRun
            ? mlRunLabel(mlRun)
            : "Run ML Jobs — score every student for risk and refresh their skill assessment recommendations",
          below: mlRun && <MlRunProgress run={mlRun} />,
        }}
      />

      {notice && (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <p>{notice}</p>
          <button
            onClick={() => setNotice(null)}
            className="shrink-0 font-medium text-emerald-700 hover:text-emerald-900"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          icon={faUsers}
          value={students.length}
          label="Total Students"
          caption={`${sections.length} section${sections.length === 1 ? "" : "s"}`}
        />
        <StatTile
          icon={faCircleCheck}
          value={students.filter((s) => !s.at_risk).length}
          label="Safe"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatTile
          icon={faTriangleExclamation}
          value={students.filter((s) => s.at_risk).length}
          label="At Risk"
          iconBg="bg-rose-50"
          iconColor="text-rose-600"
        />
        <StatTile
          icon={faLayerGroup}
          value={students.filter((s) => !s.section_id).length}
          label="Unassigned"
          caption="No section yet"
          iconBg="bg-gray-100"
          iconColor="text-gray-600"
        />
      </div>

      <div className="mb-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search by name or email…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-surface py-2.5 pl-11 pr-4 text-gray-700 transition-all placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/40"
          />
        </div>
        <FilterSelect value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          <option value="all">All Students</option>
          <option value="at-risk">At Risk</option>
          <option value="safe">Safe</option>
        </FilterSelect>
        <button
          onClick={() => setSectionForm({ section: null })}
          className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-surface px-4 py-2.5 text-sm font-medium text-gray-700 transition-all hover:border-brand-300 hover:text-brand-700"
        >
          <FontAwesomeIcon icon={faFolderPlus} className="h-4 w-4" />
          New section
        </button>
      </div>

      {loading ? (
        <div className="rounded-xl border border-hairline bg-surface p-12 text-center text-gray-400 shadow-tile">
          Loading students…
        </div>
      ) : !openGroup ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            const atRisk = group.students.filter((s) => s.at_risk).length;
            const isUnassigned = group.key === UNASSIGNED_KEY;
            return (
              <div
                key={group.key}
                className="group relative rounded-xl border border-hairline bg-surface p-5 shadow-tile transition-all duration-200 focus-within:border-brand-300 hover:border-brand-300 hover:shadow-tile-hover"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                        isUnassigned
                          ? "bg-gray-100 text-gray-500"
                          : "bg-brand-600/10 text-brand-600"
                      }`}
                    >
                      <FontAwesomeIcon icon={faLayerGroup} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{group.name}</p>
                      <p className="text-xs text-gray-500">
                        {group.students.length} student{group.students.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  {/* Above the card-wide overlay button, so these stay clickable. */}
                  {!isUnassigned && (
                    <div className="relative z-10 flex shrink-0 items-center gap-0.5">
                      <button
                        onClick={() =>
                          setSectionForm({ section: { id: group.key, name: group.name } })
                        }
                        aria-label={`Rename section ${group.name}`}
                        title="Rename"
                        className="rounded-lg p-2 text-gray-300 transition-colors hover:bg-brand-600/10 hover:text-brand-600"
                      >
                        <FontAwesomeIcon icon={faPenToSquare} className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => setSectionToDelete({ id: group.key, name: group.name })}
                        aria-label={`Delete section ${group.name}`}
                        title="Delete"
                        className="rounded-lg p-2 text-gray-300 transition-colors hover:bg-rose-50 hover:text-rose-600"
                      >
                        <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-4">
                  {group.students.length === 0 ? (
                    <span className="text-xs text-gray-400">No students yet</span>
                  ) : atRisk > 0 ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700">
                      <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
                      {atRisk} at risk
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
                      All safe
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 transition-colors group-hover:text-brand-600">
                    View roster
                    <FontAwesomeIcon
                      icon={faChevronRight}
                      className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </div>
                <button
                  onClick={() => openSection(group.key)}
                  aria-label={`View ${group.name} roster`}
                  className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40"
                />
              </div>
            );
          })}

          {groups.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-gray-300 bg-surface p-12 text-center">
              <FontAwesomeIcon icon={faLayerGroup} className="h-8 w-8 text-gray-300" />
              <p className="mt-3 font-semibold text-gray-700">No sections yet</p>
              <p className="mt-1 text-sm text-gray-500">
                Create a section first — students are enrolled into one.
              </p>
              <button
                onClick={() => setSectionForm({ section: null })}
                className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-700"
              >
                <FontAwesomeIcon icon={faFolderPlus} className="h-3.5 w-3.5" />
                Create a section
              </button>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => openSection(null)}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
            >
              <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
              All sections
            </button>
            <h2 className="font-display truncate text-lg font-bold text-gray-900">
              {openGroup.name}
            </h2>
            <span className="rounded-full border border-brand-600/20 bg-brand-600/10 px-2.5 py-1 text-xs font-medium text-brand-700">
              {openGroup.students.length} student{openGroup.students.length === 1 ? "" : "s"}
            </span>
            {openGroup.key !== UNASSIGNED_KEY && (
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  onClick={() =>
                    setSectionForm({ section: { id: openGroup.key, name: openGroup.name } })
                  }
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:border-brand-300 hover:text-brand-700"
                >
                  <FontAwesomeIcon icon={faPenToSquare} className="h-3.5 w-3.5" />
                  Rename
                </button>
                <button
                  onClick={() => setSectionToDelete({ id: openGroup.key, name: openGroup.name })}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:border-rose-300 hover:text-rose-600"
                >
                  <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>

          {isRealSection && (
            <SectionGroups
              sectionId={openGroup.key}
              studentCount={openGroup.students.length}
              overview={teamsOverview ?? null}
              onChanged={refreshTeams}
            />
          )}

          {isRealSection && (
            <div className="mb-2 mt-2 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display text-base font-semibold text-gray-900">
                {hasGroups ? "Not in a group" : "Students"}{" "}
                <span className="text-sm font-normal text-gray-400">({tableStudents.length})</span>
              </h3>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setBulkEnrolling(true)}
                  className="flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:border-brand-300 hover:text-brand-700"
                >
                  <FontAwesomeIcon icon={faUsers} className="h-3.5 w-3.5" />
                  Bulk enroll
                </button>
                <button
                  onClick={() => setRegistering(true)}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-700"
                >
                  <FontAwesomeIcon icon={faUserPlus} className="h-3.5 w-3.5" />
                  Register student
                </button>
              </div>
            </div>
          )}

          {selectedStudents.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-brand-600/20 bg-brand-600/5 px-4 py-3">
              <p className="text-sm font-medium text-gray-700">
                {selectedStudents.length} student{selectedStudents.length === 1 ? "" : "s"} selected
              </p>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-800"
              >
                Clear
              </button>
              {hasGroups && (
                <p className="text-sm text-gray-500">Drag any of them onto a group to add them all.</p>
              )}
              <button
                onClick={() => {
                  setBatchDeleteError(null);
                  setConfirmingBatchDelete(true);
                }}
                className="ml-auto flex items-center gap-2 rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(225_29_72_/_0.35)] transition-all hover:bg-rose-700"
              >
                <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
                Delete selected
              </button>
            </div>
          )}

          <div
            onDragOver={(e) => {
              if (!hasGroups || !isStudentDrag(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setTableDropActive(true);
            }}
            onDragLeave={(e) => {
              if (leftTarget(e)) setTableDropActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setTableDropActive(false);
              const drag = readStudentDrag(e);
              // Only a student dragged out of a group has anywhere to leave.
              if (!drag?.fromGroupId) return;
              void (async () => {
                const progress = loadingToast(`Taking ${drag.label} out of their group…`);
                let failure: string | null = null;
                for (const id of drag.studentIds) {
                  const result = await moveStudentToTeam(id, null);
                  if ("error" in result) failure = result.error;
                }
                await refreshTeams();
                if (failure) progress.error(failure);
                else progress.success(`${drag.label} ${drag.studentIds.length === 1 ? "is" : "are"} no longer in a group`);
              })();
            }}
            className={`relative overflow-hidden rounded-xl border bg-surface shadow-tile transition-all duration-150 ${
              tableDropActive ? "border-brand-500 ring-2 ring-brand-500/40" : "border-hairline"
            }`}
          >
            {tableDropActive && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-brand-50/85">
                <span className="rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm">
                  Drop to take them out of their group
                </span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-100 bg-subtle">
                  <tr>
                    <th className="w-12 px-4 py-3 sm:pl-6 sm:pr-0">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        // Partial selections read as neither on nor off; only the
                        // DOM node carries that third state.
                        ref={(el) => {
                          if (el) {
                            el.indeterminate = selectedStudents.length > 0 && !allVisibleSelected;
                          }
                        }}
                        onChange={toggleAllVisible}
                        disabled={visibleCount === 0}
                        aria-label={`Select all students in ${openGroup.name}`}
                        className="h-4 w-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </th>
                    {/* With groups, this table is only who is left over, so it
                        keeps to who they are and when they joined. */}
                    {(hasGroups
                      ? ["Name", "Enrolled"]
                      : ["Student", "Skill Assessments", "Avg. Score", "Status", "Last Active"]
                    ).map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:px-6"
                      >
                        {h}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:px-6">
                      View details
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {tableStudents.map((student) => (
                    <tr
                      key={student.id}
                      draggable={hasGroups}
                      onDragStart={(e) => {
                        // Dragging a selected row carries the whole selection;
                        // dragging any other row carries just that one.
                        const carried = selectedIds.has(student.id)
                          ? tableStudents.filter((s) => selectedIds.has(s.id))
                          : [student];
                        startStudentDrag(e, carried, null);
                      }}
                      title={
                        hasGroups
                          ? "Click to select, Ctrl+click to add more, Shift+click for a range, then drag onto a group"
                          : "Click to select, Ctrl+click to add more, Shift+click for a range"
                      }
                      // Clicking a row only picks it; the folder icon opens the profile.
                      onClick={(e) => selectRow(student.id, e)}
                      className={`select-none transition-colors ${hasGroups ? "cursor-grab active:cursor-grabbing" : "cursor-default"} ${
                        selectedIds.has(student.id)
                          ? "bg-brand-600/10 shadow-[inset_3px_0_0_0_var(--color-brand-600)]"
                          : "hover:bg-subtle"
                      }`}
                    >
                      {/* The checkbox toggles on its own, without the row-click selection rules. */}
                      <td
                        className="px-4 py-4 sm:pl-6 sm:pr-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          checked={selectedIds.has(student.id)}
                          onChange={() => toggleStudent(student.id)}
                          aria-label={`Select ${student.name}`}
                          className="h-4 w-4 cursor-pointer accent-brand-600"
                        />
                      </td>
                      <td className="px-4 py-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={student.name}
                            src={student.picture_url}
                            userId={student.id}
                            sex={student.sex}
                            size="md"
                            tone={student.at_risk ? "risk" : "brand"}
                          />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-gray-800">{student.name}</p>
                            <p className="truncate text-sm text-gray-500">{student.email}</p>
                          </div>
                        </div>
                      </td>
                      {hasGroups ? (
                        <>
                          <td className="px-4 py-4 text-sm text-gray-500 sm:px-6">
                            {new Date(student.created_at).toLocaleString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            })}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-4 text-sm font-medium text-gray-600 sm:px-6">
                            {student.quizzes_completed}
                          </td>
                          <td className="px-4 py-4 sm:px-6">
                            {student.average_score === null ? (
                              <span className="text-sm text-gray-400">No attempts</span>
                            ) : (
                              <span
                                className={`text-sm font-semibold ${
                                  student.average_score >= 70 ? "text-brand-600" : "text-rose-600"
                                }`}
                              >
                                {student.average_score}%
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4 sm:px-6">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                                student.at_risk
                                  ? "bg-rose-50 text-rose-600"
                                  : "bg-emerald-50 text-emerald-600"
                              }`}
                            >
                              {student.at_risk ? "At Risk" : "Safe"}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-sm text-gray-500 sm:px-6">
                            {formatLastActive(student.last_login_at)}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-4 sm:px-6" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => router.push(`/admin/students/${student.id}`)}
                          aria-label={`View ${student.name}'s profile`}
                          title="View profile"
                          className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-brand-600/10 hover:text-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40"
                        >
                          <FontAwesomeIcon icon={faFolderOpen} className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {tableStudents.length === 0 && (
                    <tr>
                      <td colSpan={hasGroups ? 4 : 7} className="py-12 text-center text-gray-400">
                        {hasGroups ? "Every student is in a group" : "No students in this section yet"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {bulkEnrolling && isRealSection && (
        <BulkEnrollModal
          sectionId={openGroup.key}
          sectionName={openGroup.name}
          groups={sectionGroups}
          onClose={() => setBulkEnrolling(false)}
          onFinished={(created) => {
            if (created > 0) void loadStudents();
            void refreshTeams();
          }}
        />
      )}

      {registering && isRealSection && (
        <RegisterStudentModal
          sectionId={openGroup.key}
          sectionName={openGroup.name}
          groups={sectionGroups}
          onClose={() => setRegistering(false)}
          onRegistered={() => {
            void loadStudents();
            void refreshTeams();
          }}
        />
      )}

      {sectionForm && (
        <SectionFormModal
          section={sectionForm.section}
          existingNames={sections.map((s) => s.name)}
          onClose={() => setSectionForm(null)}
          onSaved={refreshAfterSectionChange}
        />
      )}

      {confirmingBatchDelete && selectedStudents.length > 0 && (
        <ConfirmModal
          onClose={batchDeleting ? () => {} : () => setConfirmingBatchDelete(false)}
          config={{
            title: `Delete ${selectedStudents.length} student${
              selectedStudents.length === 1 ? "" : "s"
            }?`,
            message:
              "Their accounts, skill assessment attempts, scores and risk history are removed permanently. This cannot be undone.",
            confirmLabel: `Delete ${selectedStudents.length}`,
            loading: batchDeleting,
            error: batchDeleteError,
            onConfirm: () => void handleBatchDelete(),
            children: (
              <ul className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-hairline bg-subtle p-2.5 text-sm text-gray-700">
                {selectedStudents.map((s) => (
                  <li key={s.id} className="truncate">
                    {s.name} <span className="text-gray-400">{s.email}</span>
                  </li>
                ))}
              </ul>
            ),
          }}
        />
      )}

      {sectionToDelete && (
        <DeleteSectionModal
          section={sectionToDelete}
          onClose={() => setSectionToDelete(null)}
          onDeleted={(message) => {
            // Its students land in Unassigned, so the open drill-in is gone.
            if (selectedSection === sectionToDelete.id) openSection(null);
            refreshAfterSectionChange(message);
          }}
        />
      )}
    </div>
  );
}
