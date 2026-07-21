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
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../components/PageHeader";
import { SkeletonAssessmentCard } from "../../components/skeletons";
import { fetchSections, type Section } from "../../lib/api";

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
  question_count: number;
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
  const [message, setMessage] = useState<string | null>(null);

  // assign modal
  const [assignTarget, setAssignTarget] = useState<Assessment | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [assignDeadline, setAssignDeadline] = useState("");

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 4000);
  };

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
      flash(j.error ?? "Failed to update");
      return;
    }
    flash(a.is_published ? "Assessment unpublished" : "Assessment published");
    loadAssessments();
  };

  const deleteAssessment = async (a: Assessment) => {
    if (!window.confirm(`Delete "${a.title}" and all its questions? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/faculty/assessments/${a.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      flash("Failed to delete assessment");
      return;
    }
    flash("Assessment deleted");
    loadAssessments();
  };

  // ---------- assign ----------

  const openAssignModal = (a: Assessment) => {
    setAssignTarget(a);
    setSelectedStudents(new Set());
    setAssignDeadline("");
  };

  const submitAssign = async () => {
    if (!assignTarget || selectedStudents.size === 0) {
      flash("Select at least one student");
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
      }),
    });
    setBusy(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      flash(j.error ?? "Failed to assign");
      return;
    }
    setAssignTarget(null);
    flash(`Assigned to ${selectedStudents.size} student${selectedStudents.size === 1 ? "" : "s"}`);
    loadAssessments();
  };

  // ---------- render ----------

  return (
    <div className="space-y-4">
      <PageHeader
        title="Question Bank"
        subtitle="Create quizzes, manage questions, and assign them to your students"
      />

      {message && (
        <div className="bg-brand-600/10 border border-brand-600/30 text-[#155663] px-4 py-3 rounded-xl text-sm">
          {message}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={() => router.push("/faculty/assessments/new")}
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-[#155663] transition-colors text-sm font-medium shadow-[0_2px_6px_rgba(27,107,123,0.2)]"
        >
          <FontAwesomeIcon icon={faPlus} className="w-3.5 h-3.5" />
          New Assessment
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonAssessmentCard key={i} />
          ))}
        </div>
      ) : assessments.length === 0 ? (
        <div className="bg-surface p-12 rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] text-center text-gray-500">
          No assessments yet. Create your first quiz to start building the question bank.
        </div>
      ) : (
        <div className="space-y-4">
          {assessments.map((a) => (
            <div key={a.id} className="relative bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
              <span className={`absolute left-0 top-0 h-full w-0.5 ${
                a.difficulty === "beginner" ? "bg-emerald-500" :
                a.difficulty === "intermediate" ? "bg-amber-500" :
                a.difficulty === "advanced" ? "bg-rose-500" : "bg-gray-500"
              }`} aria-hidden />
              <div className="p-6">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <h3 className="font-semibold text-gray-800">{a.title}</h3>
                      <span
                        className={`px-2 py-0.5 text-xs rounded-full ${
                          a.is_published
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {a.is_published ? "Published" : "Draft"}
                      </span>
                    </div>
                    {a.description && (
                      <p className="text-sm text-gray-500 mb-2">{a.description}</p>
                    )}
                    <div className="flex items-center gap-3 text-sm text-gray-400 flex-wrap">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded">
                        {a.category}
                      </span>
                      <span
                        className={`px-2 py-0.5 rounded ${
                          a.difficulty === "beginner"
                            ? "bg-green-100 text-green-700"
                            : a.difficulty === "intermediate"
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                        }`}
                      >
                        {a.difficulty}
                      </span>
                      <span>{a.question_count} questions</span>
                      <span>{a.student_count} assigned</span>
                      {a.time_limit_seconds && (
                        <span>{Math.round(a.time_limit_seconds / 60)} min limit</span>
                      )}
                      {a.target_sections && a.target_sections.length > 0 && (
                        <span className="text-xs text-gray-500">
                          Sections: {a.target_sections.join(", ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => openAssignModal(a)}
                      disabled={!a.is_published}
                      title={a.is_published ? "Assign to students" : "Publish first to assign"}
                      className="p-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                    >
                      <FontAwesomeIcon icon={faUserPlus} className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => togglePublish(a)}
                      disabled={busy}
                      title={a.is_published ? "Unpublish" : "Publish"}
                      className="p-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      <FontAwesomeIcon
                        icon={a.is_published ? faEyeSlash : faGlobe}
                        className="w-4 h-4"
                      />
                    </button>
                    <button
                      onClick={() => router.push(`/faculty/assessments/${a.id}`)}
                      title="Edit details"
                      className="p-2.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      <FontAwesomeIcon icon={faPen} className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteAssessment(a)}
                      title="Delete"
                      className="p-2.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50"
                    >
                      <FontAwesomeIcon icon={faTrash} className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => router.push(`/faculty/assessments/${a.id}`)}
                      title="Manage questions"
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-brand-600/10 text-[#155663] hover:bg-brand-600/20 text-sm font-medium"
                    >
                      <FontAwesomeIcon icon={faListCheck} className="w-4 h-4" />
                      Questions
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ---------- assign modal ---------- */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] w-full max-w-lg p-4 space-y-2 max-h-[90vh] overflow-y-auto border border-hairline">
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
                className="px-6 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-[#155663] disabled:opacity-60"
              >
                {busy ? "Assigning…" : "Assign"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
