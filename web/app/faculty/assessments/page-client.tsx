"use client";

import { useState, useEffect, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faTimes,
  faSpinner,
  faUserPlus,
  faListCheck,
  faTrash,
  faPen,
  faGlobe,
  faEyeSlash,
  faChevronDown,
  faCheck,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../components/PageHeader";

const inputClassName =
  "w-full px-4 py-3 bg-white border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] focus:bg-white transition-all text-sm shadow-sm";
const labelClassName = "block text-sm font-bold text-gray-800 mb-2";

const CATEGORIES = [
  "Cardiac Emergency",
  "Respiratory Emergency",
  "Neurological Emergency",
  "Trauma",
  "Medical-Surgical",
  "Patient Education",
  "Infection Management",
  "Critical Care",
  "Medication Safety",
  "General",
] as const;

type Difficulty = "beginner" | "intermediate" | "advanced";

interface Assessment {
  id: string;
  title: string;
  description: string;
  difficulty: Difficulty;
  category: string;
  time_limit_seconds: number | null;
  is_published: boolean;
  question_count: number;
  student_count: number;
  created_at: string;
}

interface AssessmentQuestion {
  id: string;
  position: number;
  content: string;
  options: string[];
  correct_index: number;
  explanation: string;
  competency_ids: string[];
}

interface Competency {
  id: string;
  name: string;
}

interface Student {
  id: string;
  name: string;
  email: string;
}

const emptyAssessmentForm = {
  title: "",
  description: "",
  difficulty: "beginner" as Difficulty,
  category: "General" as (typeof CATEGORIES)[number],
  time_limit_minutes: "",
};

const emptyQuestionForm = {
  content: "",
  options: ["", "", "", ""],
  correct_index: 0,
  explanation: "",
  competency_ids: [] as string[],
};

export default function FacultyAssessmentsClient() {
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [competencies, setCompetencies] = useState<Competency[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // create / edit assessment modal
  const [showAssessmentModal, setShowAssessmentModal] = useState(false);
  const [editingAssessment, setEditingAssessment] = useState<Assessment | null>(null);
  const [assessmentForm, setAssessmentForm] = useState(emptyAssessmentForm);

  // expanded question editor
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [questionForm, setQuestionForm] = useState(emptyQuestionForm);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);

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
    const initialize = async () => {
      try {
        const [, compRes, studRes] = await Promise.all([
          loadAssessments(),
          fetch("/api/competencies", { credentials: "include" }),
          fetch("/api/faculty/students", { credentials: "include" }),
        ]);
        if (compRes.ok) {
          const j = (await compRes.json()) as { competencies: Competency[] };
          setCompetencies(j.competencies ?? []);
        }
        if (studRes.ok) {
          const j = (await studRes.json()) as { students: Student[] };
          setStudents(j.students ?? []);
        }
      } finally {
        setLoading(false);
      }
    };
    void initialize();
  }, [loadAssessments]);

  const loadQuestions = useCallback(async (assessmentId: string) => {
    setQuestionsLoading(true);
    const res = await fetch(`/api/faculty/assessments/${assessmentId}`, {
      credentials: "include",
    });
    if (res.ok) {
      const json = (await res.json()) as {
        assessment: { questions: AssessmentQuestion[] };
      };
      setQuestions(json.assessment.questions ?? []);
    }
    setQuestionsLoading(false);
  }, []);

  const toggleExpand = (assessment: Assessment) => {
    if (expandedId === assessment.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(assessment.id);
    setQuestions([]);
    setQuestionForm(emptyQuestionForm);
    setEditingQuestionId(null);
    loadQuestions(assessment.id);
  };

  // ---------- assessment CRUD ----------

  const openCreateModal = () => {
    setEditingAssessment(null);
    setAssessmentForm(emptyAssessmentForm);
    setShowAssessmentModal(true);
  };

  const openEditModal = (a: Assessment) => {
    setEditingAssessment(a);
    setAssessmentForm({
      title: a.title,
      description: a.description,
      difficulty: a.difficulty,
      category: (CATEGORIES.includes(a.category as (typeof CATEGORIES)[number])
        ? a.category
        : "General") as (typeof CATEGORIES)[number],
      time_limit_minutes: a.time_limit_seconds ? String(Math.round(a.time_limit_seconds / 60)) : "",
    });
    setShowAssessmentModal(true);
  };

  const saveAssessment = async () => {
    if (!assessmentForm.title.trim()) {
      flash("Title is required");
      return;
    }
    setBusy(true);
    const payload = {
      title: assessmentForm.title,
      description: assessmentForm.description,
      difficulty: assessmentForm.difficulty,
      category: assessmentForm.category,
      time_limit_seconds: assessmentForm.time_limit_minutes
        ? Number(assessmentForm.time_limit_minutes) * 60
        : null,
    };
    const res = editingAssessment
      ? await fetch(`/api/faculty/assessments/${editingAssessment.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        })
      : await fetch("/api/faculty/assessments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
    setBusy(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      flash(j.error ?? "Failed to save assessment");
      return;
    }
    setShowAssessmentModal(false);
    flash(editingAssessment ? "Assessment updated" : "Assessment created");
    loadAssessments();
  };

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
    if (expandedId === a.id) setExpandedId(null);
    flash("Assessment deleted");
    loadAssessments();
  };

  // ---------- question CRUD ----------

  const startEditQuestion = (q: AssessmentQuestion) => {
    setEditingQuestionId(q.id);
    setQuestionForm({
      content: q.content,
      options: q.options.length >= 2 ? [...q.options] : ["", ""],
      correct_index: q.correct_index,
      explanation: q.explanation,
      competency_ids: [...q.competency_ids],
    });
  };

  const saveQuestion = async () => {
    if (!expandedId) return;
    const filledOptions = questionForm.options.filter((o) => o.trim().length > 0);
    if (!questionForm.content.trim() || filledOptions.length < 2) {
      flash("A question needs content and at least two options");
      return;
    }
    if (questionForm.correct_index >= filledOptions.length) {
      flash("Mark one of the filled options as correct");
      return;
    }
    setBusy(true);
    const payload = {
      content: questionForm.content,
      options: filledOptions,
      correct_index: questionForm.correct_index,
      explanation: questionForm.explanation,
      competency_ids: questionForm.competency_ids,
    };
    const res = editingQuestionId
      ? await fetch(`/api/faculty/questions/${editingQuestionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        })
      : await fetch(`/api/faculty/assessments/${expandedId}/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });
    setBusy(false);
    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      flash(j.error ?? "Failed to save question");
      return;
    }
    setQuestionForm(emptyQuestionForm);
    setEditingQuestionId(null);
    flash(editingQuestionId ? "Question updated" : "Question added");
    loadQuestions(expandedId);
    loadAssessments();
  };

  const deleteQuestion = async (q: AssessmentQuestion) => {
    if (!expandedId) return;
    if (!window.confirm("Delete this question?")) return;
    setBusy(true);
    const res = await fetch(`/api/faculty/questions/${q.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    setBusy(false);
    if (!res.ok) {
      flash("Failed to delete question");
      return;
    }
    if (editingQuestionId === q.id) {
      setEditingQuestionId(null);
      setQuestionForm(emptyQuestionForm);
    }
    loadQuestions(expandedId);
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
    <div className="space-y-6">
      <PageHeader
        title="Question Bank"
        subtitle="Create quizzes, manage questions, and assign them to your students"
      />

      {message && (
        <div className="bg-[#1B6B7B]/10 border border-[#1B6B7B]/30 text-[#155663] px-4 py-3 rounded-xl text-sm">
          {message}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-5 py-2.5 bg-[#1B6B7B] text-white rounded-xl hover:bg-[#155663] transition-colors text-sm font-medium"
        >
          <FontAwesomeIcon icon={faPlus} className="w-3.5 h-3.5" />
          New Assessment
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <FontAwesomeIcon icon={faSpinner} spin className="w-6 h-6 text-[#1B6B7B]" />
        </div>
      ) : assessments.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl shadow-sm border border-gray-100 text-center text-gray-500">
          No assessments yet. Create your first quiz to start building the question bank.
        </div>
      ) : (
        <div className="space-y-4">
          {assessments.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl shadow-sm border border-gray-100">
              <div className="p-6">
                <div className="flex items-start justify-between gap-4">
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
                      onClick={() => openEditModal(a)}
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
                      onClick={() => toggleExpand(a)}
                      title="Manage questions"
                      className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#1B6B7B]/10 text-[#155663] hover:bg-[#1B6B7B]/20 text-sm font-medium"
                    >
                      <FontAwesomeIcon icon={faListCheck} className="w-4 h-4" />
                      Questions
                      <FontAwesomeIcon
                        icon={faChevronDown}
                        className={`w-3 h-3 transition-transform ${
                          expandedId === a.id ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {expandedId === a.id && (
                <div className="border-t border-gray-100 p-6 space-y-6 bg-gray-50/50 rounded-b-2xl">
                  {questionsLoading ? (
                    <div className="flex justify-center py-6">
                      <FontAwesomeIcon icon={faSpinner} spin className="w-5 h-5 text-[#1B6B7B]" />
                    </div>
                  ) : (
                    <>
                      {questions.length > 0 && (
                        <div className="space-y-3">
                          {questions.map((q, i) => (
                            <div
                              key={q.id}
                              className="bg-white p-4 rounded-xl border border-gray-200"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="font-medium text-gray-800 text-sm mb-2">
                                    {i + 1}. {q.content}
                                  </p>
                                  <div className="space-y-1">
                                    {q.options.map((opt, idx) => (
                                      <p
                                        key={idx}
                                        className={`text-sm px-3 py-1 rounded ${
                                          idx === q.correct_index
                                            ? "bg-green-50 text-green-700 font-medium"
                                            : "text-gray-500"
                                        }`}
                                      >
                                        {opt}
                                        {idx === q.correct_index && " ✓"}
                                      </p>
                                    ))}
                                  </div>
                                  {q.competency_ids.length > 0 && (
                                    <div className="flex gap-1.5 flex-wrap mt-2">
                                      {q.competency_ids.map((cid) => {
                                        const c = competencies.find((x) => x.id === cid);
                                        return c ? (
                                          <span
                                            key={cid}
                                            className="px-2 py-0.5 bg-[#1B6B7B]/10 text-[#155663] text-xs rounded-full"
                                          >
                                            {c.name}
                                          </span>
                                        ) : null;
                                      })}
                                    </div>
                                  )}
                                </div>
                                <div className="flex gap-1.5 shrink-0">
                                  <button
                                    onClick={() => startEditQuestion(q)}
                                    className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
                                  >
                                    <FontAwesomeIcon icon={faPen} className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    onClick={() => deleteQuestion(q)}
                                    className="p-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50"
                                  >
                                    <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="bg-white p-5 rounded-xl border border-gray-200 space-y-4">
                        <p className="font-semibold text-gray-800 text-sm">
                          {editingQuestionId ? "Edit question" : "Add a question"}
                        </p>
                        <textarea
                          value={questionForm.content}
                          onChange={(e) =>
                            setQuestionForm((f) => ({ ...f, content: e.target.value }))
                          }
                          placeholder="Question text"
                          rows={2}
                          className={inputClassName}
                        />
                        <div className="space-y-2">
                          {questionForm.options.map((opt, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                              <input
                                type="radio"
                                name="correct-option"
                                checked={questionForm.correct_index === idx}
                                onChange={() =>
                                  setQuestionForm((f) => ({ ...f, correct_index: idx }))
                                }
                                className="w-4 h-4 accent-[#1B6B7B] shrink-0"
                                title="Mark as correct answer"
                              />
                              <input
                                value={opt}
                                onChange={(e) =>
                                  setQuestionForm((f) => {
                                    const options = [...f.options];
                                    options[idx] = e.target.value;
                                    return { ...f, options };
                                  })
                                }
                                placeholder={`Option ${idx + 1}`}
                                className={inputClassName}
                              />
                            </div>
                          ))}
                        </div>
                        <textarea
                          value={questionForm.explanation}
                          onChange={(e) =>
                            setQuestionForm((f) => ({ ...f, explanation: e.target.value }))
                          }
                          placeholder="Explanation shown after answering (optional)"
                          rows={2}
                          className={inputClassName}
                        />
                        <div>
                          <p className={labelClassName}>Competency areas</p>
                          <div className="flex gap-2 flex-wrap">
                            {competencies.map((c) => {
                              const active = questionForm.competency_ids.includes(c.id);
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() =>
                                    setQuestionForm((f) => ({
                                      ...f,
                                      competency_ids: active
                                        ? f.competency_ids.filter((x) => x !== c.id)
                                        : [...f.competency_ids, c.id],
                                    }))
                                  }
                                  className={`px-3 py-1.5 rounded-full text-xs border transition-colors ${
                                    active
                                      ? "bg-[#1B6B7B] text-white border-[#1B6B7B]"
                                      : "bg-white text-gray-600 border-gray-300 hover:border-[#1B6B7B]"
                                  }`}
                                >
                                  {active && (
                                    <FontAwesomeIcon icon={faCheck} className="w-3 h-3 mr-1" />
                                  )}
                                  {c.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          {editingQuestionId && (
                            <button
                              onClick={() => {
                                setEditingQuestionId(null);
                                setQuestionForm(emptyQuestionForm);
                              }}
                              className="px-4 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
                            >
                              Cancel
                            </button>
                          )}
                          <button
                            onClick={saveQuestion}
                            disabled={busy}
                            className="px-5 py-2 bg-[#1B6B7B] text-white rounded-lg text-sm hover:bg-[#155663] disabled:opacity-60"
                          >
                            {busy ? "Saving…" : editingQuestionId ? "Save Changes" : "Add Question"}
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ---------- create/edit assessment modal ---------- */}
      {showAssessmentModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-800">
                {editingAssessment ? "Edit Assessment" : "New Assessment"}
              </h3>
              <button
                onClick={() => setShowAssessmentModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <FontAwesomeIcon icon={faTimes} className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className={labelClassName}>Title</label>
              <input
                value={assessmentForm.title}
                onChange={(e) => setAssessmentForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="e.g. Vital Signs Fundamentals"
                className={inputClassName}
              />
            </div>
            <div>
              <label className={labelClassName}>Description</label>
              <textarea
                value={assessmentForm.description}
                onChange={(e) =>
                  setAssessmentForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={2}
                className={inputClassName}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClassName}>Difficulty</label>
                <select
                  value={assessmentForm.difficulty}
                  onChange={(e) =>
                    setAssessmentForm((f) => ({
                      ...f,
                      difficulty: e.target.value as Difficulty,
                    }))
                  }
                  className={inputClassName}
                >
                  <option value="beginner">Beginner</option>
                  <option value="intermediate">Intermediate</option>
                  <option value="advanced">Advanced</option>
                </select>
              </div>
              <div>
                <label className={labelClassName}>Category</label>
                <select
                  value={assessmentForm.category}
                  onChange={(e) =>
                    setAssessmentForm((f) => ({
                      ...f,
                      category: e.target.value as (typeof CATEGORIES)[number],
                    }))
                  }
                  className={inputClassName}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClassName}>Time limit (minutes, optional)</label>
              <input
                type="number"
                min={1}
                value={assessmentForm.time_limit_minutes}
                onChange={(e) =>
                  setAssessmentForm((f) => ({ ...f, time_limit_minutes: e.target.value }))
                }
                placeholder="No limit"
                className={inputClassName}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowAssessmentModal(false)}
                className="px-5 py-2 rounded-lg border border-gray-200 text-gray-600 text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={saveAssessment}
                disabled={busy}
                className="px-6 py-2 bg-[#1B6B7B] text-white rounded-lg text-sm hover:bg-[#155663] disabled:opacity-60"
              >
                {busy ? "Saving…" : editingAssessment ? "Save Changes" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- assign modal ---------- */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
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
              <div className="border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-64 overflow-y-auto">
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
                        className="w-4 h-4 accent-[#1B6B7B]"
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
                className="px-6 py-2 bg-[#1B6B7B] text-white rounded-lg text-sm hover:bg-[#155663] disabled:opacity-60"
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
