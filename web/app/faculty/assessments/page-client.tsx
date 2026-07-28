"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faTimes,
  faUserPlus,
  faListCheck,
  faTrash,
  faPen,
  faGlobe,
  faEyeSlash,
  faSearch,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../components/PageHeader";
import { SkeletonAssessmentCard } from "../../components/skeletons";
import { fetchSections, type Section } from "../../lib/api";
import { toast } from "../../components/Toast";
import ConfirmModal from "../../components/ConfirmModal";

const inputClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm shadow-sm";
const labelClassName = "block text-sm font-bold text-gray-800 mb-2";

type Difficulty = "beginner" | "intermediate" | "advanced";

interface Assessment {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  category: string;
  time_limit_seconds: number | null;
  is_published: boolean;
  target_sections: string[] | null;
  /** Size of the question bank. */
  question_count: number;
  /** How many of the bank one attempt serves; null serves all of it. */
  total_questions: number | null;
  /** Tries a student gets; null is unlimited. */
  max_attempts: number | null;
  student_count: number;
  created_at: string;
}

interface Student {
  id: string;
  name: string;
  email: string;
}

export default function FacultyAssessmentsClient() {
  const router = useRouter();
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Assessment | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const filteredAssessments = assessments.filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      a.description.toLowerCase().includes(q) ||
      a.category.toLowerCase().includes(q) ||
      a.difficulty.toLowerCase().includes(q)
    );
  });

  // assign modal
  const [assignTarget, setAssignTarget] = useState<Assessment | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [assignDeadline, setAssignDeadline] = useState("");
  const [assignMaxAttempts, setAssignMaxAttempts] = useState("");

  const loadAssessments = useCallback(async () => {
    const res = await fetch("/api/faculty/assessments", { credentials: "include" });
    if (res.ok) {
      const json = (await res.json()) as { assessments: Assessment[] };
      setAssessments(json.assessments ?? []);
    }
  }, []);

  useEffect(() => {
    Promise.all([
      loadAssessments(),
      fetch("/api/faculty/students", { credentials: "include" }).then(async (r) => {
        if (r.ok) {
          const j = (await r.json()) as { students: Student[] };
          setStudents(j.students ?? []);
        }
      }),
      fetchSections().then(setSections),
    ]).finally(() => setLoading(false));
  }, [loadAssessments]);

  // ---------- assessment CRUD ----------

  const togglePublish = async (a: Assessment) => {
    setBusy(true);
    const res = await fetch(`/api/faculty/assessments/${a.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ is_published: !a.is_published }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      toast(j.error ?? "Failed to update");
      return;
    }
    toast(a.is_published ? "Assessment unpublished" : "Assessment published");
    loadAssessments();
  };

  const confirmAndDelete = async (a: Assessment) => {
    setBusy(true);
    setDeleteError(null);
    const res = await fetch(`/api/faculty/assessments/${a.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      setDeleteError("Failed to delete assessment. Please try again.");
      return;
    }
    toast("Assessment deleted");
    setConfirmDelete(null);
    loadAssessments();
  };

  // ---------- assign ----------

  const openAssignModal = (a: Assessment) => {
    setAssignTarget(a);
    setSelectedStudents(new Set());
    setAssignDeadline("");
    setAssignMaxAttempts("");
  };

  const submitAssign = async () => {
    if (!assignTarget || selectedStudents.size === 0) {
      toast("Select at least one student");
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/faculty/assessments/${assignTarget.id}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        student_ids: Array.from(selectedStudents),
        deadline: assignDeadline || null,
        max_attempts: assignMaxAttempts ? Number(assignMaxAttempts) : null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      toast(j.error ?? "Failed to assign");
      return;
    }
    setAssignTarget(null);
    toast(`Assigned to ${selectedStudents.size} student${selectedStudents.size === 1 ? "" : "s"}`);
    loadAssessments();
  };

  // ---------- render ----------

  return (
    <div className="space-y-4">
      <PageHeader
        title="Question Bank"
        subtitle="Create quizzes, manage questions, and assign them to your students"
      />

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: "Total Assessments", value: assessments.length, color: "text-gray-800" },
          { label: "Published", value: assessments.filter((a) => a.is_published).length, color: "text-green-700" },
          { label: "Draft", value: assessments.filter((a) => !a.is_published).length, color: "text-gray-500" },
        ].map((stat) => (
          <div key={stat.label} className="bg-surface rounded-xl border border-hairline p-4 shadow-tile">
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className={`text-2xl font-semibold ${stat.color} mt-0.5`}>{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <FontAwesomeIcon
            icon={faSearch}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400"
          />
          <input
            type="text"
            placeholder="Search assessments by title, description, category..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-gray-400 rounded-xl text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 transition-all"
          />
        </div>
        <button
          onClick={() => router.push("/faculty/assessments/new")}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium shadow-[0_2px_6px_rgba(27,107,123,0.2)] shrink-0"
        >
          <FontAwesomeIcon icon={faPlus} className="w-3.5 h-3.5" />
          New Assessment
        </button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonAssessmentCard key={i} />
          ))}
        </div>
      ) : filteredAssessments.length === 0 ? (
        <div className="bg-surface p-12 rounded-xl border border-hairline shadow-tile text-center text-gray-500">
          {searchQuery ? "No assessments match your search." : "No assessments yet. Create your first quiz to start building the question bank."}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredAssessments.map((a) => (
            <div key={a.id} className="relative bg-surface rounded-xl border border-hairline shadow-tile overflow-hidden flex flex-col">
              {/* -600 not -500: the dark theme rethemes 50/100/200/600/700/800
                  of the tinted ramps, so a 500 would keep its light-mode
                  saturation on a dark surface. */}
              <span className={`absolute left-0 top-0 h-full w-0.5 ${
                a.difficulty === "beginner" ? "bg-emerald-600" :
                a.difficulty === "intermediate" ? "bg-amber-600" :
                a.difficulty === "advanced" ? "bg-rose-600" : "bg-gray-600"
              }`} aria-hidden />
              <div className="p-4 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-semibold text-gray-800 truncate">{a.title}</h3>
                  <span className={`px-2 py-0.5 text-xs rounded-full shrink-0 ${
                    a.is_published
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}>
                    {a.is_published ? "Published" : "Draft"}
                  </span>
                </div>
                {a.description && (
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">{a.description}</p>
                )}
                <div className="flex items-center gap-2 text-sm text-gray-400 flex-wrap">
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                    {a.category}
                  </span>
                  {/* amber, not yellow: there is no yellow in the dark ramp at
                      all, so bg-yellow-100/text-yellow-700 stayed a pale
                      light-mode chip on a dark card. */}
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    a.difficulty === "beginner"
                      ? "bg-green-100 text-green-700"
                      : a.difficulty === "intermediate"
                        ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700"
                  }`}>
                    {a.difficulty}
                  </span>
                  {/* Bank size, and the paper drawn from it when they differ —
                      the surplus is held back for later attempts. */}
                  <span className="text-xs">
                    {a.question_count} question{a.question_count === 1 ? "" : "s"}
                    {a.total_questions !== null && a.total_questions < a.question_count && (
                      <span className="text-gray-500"> · serves {a.total_questions}</span>
                    )}
                  </span>
                  <span className="text-xs">{a.student_count} assigned</span>
                  {a.time_limit_seconds && (
                    <span className="text-xs">{Math.round(a.time_limit_seconds / 60)} min</span>
                  )}
                  <span className="text-xs">
                    {a.max_attempts === null
                      ? "Unlimited tries"
                      : `${a.max_attempts} ${a.max_attempts === 1 ? "try" : "tries"}`}
                  </span>
                </div>
              </div>
              <div className="px-4 py-3 bg-subtle border-t border-hairline">
                {a.target_sections && a.target_sections.length > 0 && (
                  <div className="text-xs text-gray-500 mb-2 truncate">
                    Sections: {a.target_sections.join(", ")}
                  </div>
                )}
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => openAssignModal(a)}
                    disabled={!a.is_published}
                    title={a.is_published ? "Assign to students" : "Publish first to assign"}
                    className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                  >
                    <FontAwesomeIcon icon={faUserPlus} className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => togglePublish(a)}
                    disabled={busy}
                    title={a.is_published ? "Unpublish" : "Publish"}
                    className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    <FontAwesomeIcon icon={a.is_published ? faEyeSlash : faGlobe} className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => router.push(`/faculty/assessments/${a.id}`)}
                    title="Edit details"
                    className="p-2 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                  >
                    <FontAwesomeIcon icon={faPen} className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDelete(a)}
                    title="Delete"
                    className="p-2 rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                  >
                    <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => router.push(`/faculty/assessments/${a.id}`)}
                    title="Manage questions"
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-brand-600/10 dark:bg-brand-600/25 text-brand-700 dark:text-white hover:bg-brand-600/20 dark:hover:bg-brand-600/35 text-sm font-medium"
                  >
                    <FontAwesomeIcon icon={faListCheck} className="w-3.5 h-3.5" />
                    Questions
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- assign modal ---------- */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl shadow-overlay w-full max-w-lg p-4 space-y-2 max-h-[90vh] overflow-y-auto border border-hairline">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">
                Assign &ldquo;{assignTarget.title}&rdquo;
              </h3>
              <button
                onClick={() => setAssignTarget(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelClassName}>Deadline (optional)</label>
                <input
                  type="datetime-local"
                  value={assignDeadline}
                  onChange={(e) => setAssignDeadline(e.target.value)}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className={labelClassName}>Attempts for these students</label>
                <input
                  type="number"
                  min={1}
                  value={assignMaxAttempts}
                  onChange={(e) => setAssignMaxAttempts(e.target.value)}
                  placeholder="Use the quiz default"
                  className={inputClassName}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Overrides the quiz&apos;s own limit for the students selected below. Leave blank to
                  use it. Re-assigning without a value clears any override.
                </p>
              </div>
            </div>
            <div>
              <label className={labelClassName}>
                Students ({selectedStudents.size} selected)
              </label>
              <div className="border border-hairline rounded-xl divide-y divide-hairline max-h-64 overflow-y-auto">
                {students.length === 0 && (
                  <p className="p-4 text-sm text-gray-500">No students in your roster yet.</p>
                )}
                {students.map((s) => {
                  const checked = selectedStudents.has(s.id);
                  return (
                    <label
                      key={s.id}
                      className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelectedStudents((prev) => {
                            const next = new Set(prev);
                            if (checked) next.delete(s.id);
                            else next.add(s.id);
                            return next;
                          })
                        }
                        className="w-4 h-4 accent-brand-600"
                      />
                      <span className="text-sm text-gray-700">{s.name}</span>
                      <span className="text-xs text-gray-400 ml-auto">{s.email}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setAssignTarget(null)}
                className="px-5 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitAssign}
                disabled={busy || selectedStudents.size === 0}
                className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-60"
              >
                {busy ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          config={{
            title: "Delete Assessment",
            message: (
              <>
                <span className="font-medium text-gray-700">{confirmDelete.title}</span> will be
                permanently removed. This can&apos;t be undone.
              </>
            ),
            loading: busy,
            error: deleteError,
            onConfirm: () => confirmAndDelete(confirmDelete),
          }}
          onClose={() => { if (!busy) setConfirmDelete(null); }}
        />
      )}
    </div>
  );
}
