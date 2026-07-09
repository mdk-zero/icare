"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPlus,
  faTimes,
  faSpinner,
  faTrash,
  faCheck,
  faArrowLeft,
  faPen,
} from "@fortawesome/free-solid-svg-icons";

const inputClassName =
  "w-full px-4 py-3 bg-white border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30 focus:border-[#1B6B7B] focus:bg-white transition-all text-sm shadow-sm";
const labelClassName = "block text-sm font-bold text-gray-800 mb-2";

interface AssessmentDetail {
  id: string;
  title: string;
  description: string;
  difficulty: string;
  category: string;
  time_limit_seconds: number | null;
  question_count: number;
}

interface AssessmentQuestion {
  id: string;
  position: number;
  content: string;
  options: string[];
  correct_index: number;
  question_type: string;
  points: number;
  explanation: string;
  competency_ids: string[];
}

type QuestionFormData = {
  content: string;
  options: string[];
  correct_index: number;
  question_type: string;
  points: number;
  explanation: string;
  competency_ids: string[];
};

const emptyQuestionForm: QuestionFormData = {
  content: "",
  options: [""],
  correct_index: 0,
  question_type: "multiple_choice",
  points: 1,
  explanation: "",
  competency_ids: [],
};

export default function AssessmentQuestionsClient({
  assessmentId,
}: {
  assessmentId: string;
}) {
  const router = useRouter();
  const [assessment, setAssessment] = useState<AssessmentDetail | null>(null);
  const [questions, setQuestions] = useState<AssessmentQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<string | null>(null);

  const [questionBuilders, setQuestionBuilders] = useState<
    Record<string, QuestionFormData>
  >({});
  const [savingQuestions, setSavingQuestions] = useState<
    Record<string, boolean>
  >({});
  const [newQuestionOrder, setNewQuestionOrder] = useState(0);

  const flash = (text: string) => {
    setMessage(text);
    setTimeout(() => setMessage(null), 4000);
  };

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [assessRes, detailRes] = await Promise.all([
        fetch(`/api/faculty/assessments/${assessmentId}`, {
          credentials: "include",
        }),
        fetch(`/api/faculty/assessments/${assessmentId}`, {
          credentials: "include",
        }),
      ]);

      if (assessRes.ok) {
        const json = (await assessRes.json()) as {
          assessment: { questions: AssessmentQuestion[]; title: string; description: string; difficulty: string; category: string; time_limit_seconds: number | null; question_count: number };
        };
        const a = json.assessment;
        setAssessment({
          id: assessmentId,
          title: a.title,
          description: a.description,
          difficulty: a.difficulty,
          category: a.category,
          time_limit_seconds: a.time_limit_seconds,
          question_count: a.question_count ?? json.assessment.questions.length,
        });
        const loaded = json.assessment.questions ?? [];
        setQuestions(loaded);
        const builders: Record<string, QuestionFormData> = {};
        for (const q of loaded) {
          builders[q.id] = {
            content: q.content,
            options: q.options.length >= 2 ? [...q.options] : ["", ""],
            correct_index: q.correct_index,
            question_type: q.question_type || "multiple_choice",
            points: q.points || 1,
            explanation: q.explanation,
            competency_ids: [...q.competency_ids],
          };
        }
        setQuestionBuilders(builders);
      }
    } catch (err) {
      console.error("Failed to load assessment", err);
    } finally {
      setLoading(false);
    }
  }, [assessmentId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const updateBuilderField = (
    qId: string,
    field: keyof QuestionFormData,
    value: unknown,
  ) => {
    setQuestionBuilders((prev) => ({
      ...prev,
      [qId]: { ...prev[qId], [field]: value },
    }));
  };

  const updateBuilderOption = (qId: string, index: number, value: string) => {
    setQuestionBuilders((prev) => {
      const form = prev[qId];
      if (!form) return prev;
      const options = [...form.options];
      options[index] = value;
      return { ...prev, [qId]: { ...form, options } };
    });
  };

  const addBuilderOption = (qId: string) => {
    setQuestionBuilders((prev) => {
      const form = prev[qId];
      if (!form) return prev;
      return { ...prev, [qId]: { ...form, options: [...form.options, ""] } };
    });
  };

  const removeBuilderOption = (qId: string, index: number) => {
    setQuestionBuilders((prev) => {
      const form = prev[qId];
      if (!form) return prev;
      const options = form.options.filter((_, i) => i !== index);
      const correct_index = Math.min(form.correct_index, options.length - 1);
      return { ...prev, [qId]: { ...form, options, correct_index } };
    });
  };

  const setBuilderCorrect = (qId: string, index: number) => {
    setQuestionBuilders((prev) => ({
      ...prev,
      [qId]: { ...prev[qId], correct_index: index },
    }));
  };

  const handleSaveQuestion = async (qId: string) => {
    const form = questionBuilders[qId];
    if (!form) return;

    const filledOptions = form.options.filter((o) => o.trim().length > 0);
    if (!form.content.trim() || filledOptions.length < 2) {
      flash("Question needs content and at least two options");
      return;
    }
    if (form.correct_index >= filledOptions.length) {
      flash("Mark one of the filled options as correct");
      return;
    }

    setSavingQuestions((prev) => ({ ...prev, [qId]: true }));

    const payload = {
      content: form.content,
      options: filledOptions,
      correct_index: form.correct_index,
      question_type: form.question_type,
      points: form.points,
      explanation: form.explanation,
      competency_ids: form.competency_ids,
    };

    const isNew = qId.startsWith("new_");
    const res = isNew
      ? await fetch(`/api/faculty/assessments/${assessmentId}/questions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        })
      : await fetch(`/api/faculty/questions/${qId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(payload),
        });

    setSavingQuestions((prev) => ({ ...prev, [qId]: false }));

    if (!res.ok) {
      const j = (await res.json()) as { error?: string };
      flash(j.error ?? "Failed to save question");
      return;
    }

    if (isNew) {
      const json = (await res.json()) as { question: AssessmentQuestion };
      setQuestions((prev) =>
        prev.map((q) =>
          q.id === qId ? { ...json.question, competency_ids: form.competency_ids } : q,
        ),
      );
      setQuestionBuilders((prev) => {
        const { [qId]: data, ...rest } = prev;
        return { ...rest, [json.question.id]: data };
      });
    }

    flash(isNew ? "Question added" : "Question updated");
    if (!isNew) loadData();
  };

  const handleDeleteQuestion = async (qId: string) => {
    if (qId.startsWith("new_")) {
      setQuestions((prev) => prev.filter((q) => q.id !== qId));
      setQuestionBuilders((prev) => {
        const { [qId]: _, ...rest } = prev;
        return rest;
      });
      return;
    }
    if (!window.confirm("Delete this question?")) return;
    setSavingQuestions((prev) => ({ ...prev, [qId]: true }));
    const res = await fetch(`/api/faculty/questions/${qId}`, {
      method: "DELETE",
      credentials: "include",
    });
    setSavingQuestions((prev) => ({ ...prev, [qId]: false }));
    if (!res.ok) {
      flash("Failed to delete question");
      return;
    }
    setQuestions((prev) => prev.filter((q) => q.id !== qId));
    setQuestionBuilders((prev) => {
      const { [qId]: _, ...rest } = prev;
      return rest;
    });
    flash("Question deleted");
  };

  const handleDuplicateQuestion = (qId: string) => {
    const form = questionBuilders[qId];
    if (!form) return;
    const newId = `new_${newQuestionOrder}`;
    setNewQuestionOrder((prev) => prev + 1);
    setQuestions((prev) => {
      const idx = prev.findIndex((q) => q.id === qId);
      const newQ: AssessmentQuestion = {
        id: newId,
        position: prev.length,
        content: form.content,
        options: [...form.options],
        correct_index: form.correct_index,
        question_type: form.question_type,
        points: form.points,
        explanation: form.explanation,
        competency_ids: [...form.competency_ids],
      };
      const copy = [...prev];
      copy.splice(idx + 1, 0, newQ);
      return copy;
    });
    setQuestionBuilders((prev) => ({
      ...prev,
      [newId]: { ...form },
    }));
  };

  const handleAddQuestion = () => {
    const newId = `new_${newQuestionOrder}`;
    setNewQuestionOrder((prev) => prev + 1);
    const newQ: AssessmentQuestion = {
      id: newId,
      position: questions.length,
      content: "",
      options: ["", ""],
      correct_index: 0,
      question_type: "multiple_choice",
      points: 1,
      explanation: "",
      competency_ids: [],
    };
    setQuestions((prev) => [...prev, newQ]);
    setQuestionBuilders((prev) => ({
      ...prev,
      [newId]: { ...emptyQuestionForm, options: ["", ""] },
    }));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <FontAwesomeIcon icon={faSpinner} spin className="w-6 h-6 text-[#1B6B7B]" />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="bg-white p-10 rounded-2xl shadow-sm border border-gray-100 text-center">
        <p className="text-gray-500 mb-4">Assessment not found.</p>
        <button
          onClick={() => router.push("/faculty/assessments")}
          className="px-6 py-2 bg-[#1B6B7B] text-white rounded-lg"
        >
          Back to Question Bank
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => router.push("/faculty/assessments")}
          className="p-2 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50"
        >
          <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
        </button>
        <div>
          <h1 className="text-xl font-bold text-gray-900">{assessment.title}</h1>
          <p className="text-sm text-gray-500">
            {assessment.category} · {assessment.difficulty} ·{" "}
            {assessment.question_count} question{assessment.question_count !== 1 ? "s" : ""}
            {assessment.time_limit_seconds &&
              ` · ${Math.round(assessment.time_limit_seconds / 60)} min limit`}
          </p>
        </div>
      </div>

      {assessment.description && (
        <p className="text-gray-600 text-sm bg-gray-50 p-4 rounded-xl border border-gray-200">
          {assessment.description}
        </p>
      )}

      {message && (
        <div className="bg-[#1B6B7B]/10 border border-[#1B6B7B]/30 text-[#155663] px-4 py-3 rounded-xl text-sm">
          {message}
        </div>
      )}

      {/* Question builder */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-800">
            Questions ({questions.length})
          </h2>
          <button
            onClick={handleAddQuestion}
            className="flex items-center gap-2 px-4 py-2 bg-[#1B6B7B] text-white rounded-lg text-sm hover:bg-[#155663] transition-colors font-medium"
          >
            <FontAwesomeIcon icon={faPlus} className="w-3.5 h-3.5" />
            Add Question
          </button>
        </div>

        {questions.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-dashed border-gray-300 text-center text-gray-400 text-sm">
            No questions yet. Click &quot;Add Question&quot; to start building.
          </div>
        ) : (
          <div className="space-y-4">
            {questions.map((q, i) => {
              const form = questionBuilders[q.id];
              if (!form) return null;
              const saving = savingQuestions[q.id];
              const isNew = q.id.startsWith("new_");
              return (
                <div
                  key={q.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm"
                >
                  <div className="p-5 space-y-4">
                    {/* Question header */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-gray-500 bg-gray-100 w-7 h-7 rounded-full flex items-center justify-center">
                          {i + 1}
                        </span>
                        <select
                          value={form.question_type}
                          onChange={(e) =>
                            updateBuilderField(
                              q.id,
                              "question_type",
                              e.target.value,
                            )
                          }
                          className="text-sm border border-gray-300 rounded-lg px-3 py-1.5 text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30"
                        >
                          <option value="multiple_choice">Multiple choice</option>
                          <option value="true_false">True / False</option>
                          <option value="short_answer">Short answer</option>
                        </select>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleDuplicateQuestion(q.id)}
                          title="Duplicate"
                          className="px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 text-xs font-medium"
                        >
                          Duplicate
                        </button>
                        <button
                          onClick={() => handleDeleteQuestion(q.id)}
                          title="Delete"
                          className="p-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50"
                        >
                          <FontAwesomeIcon icon={faTrash} className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Question text */}
                    <textarea
                      value={form.content}
                      onChange={(e) =>
                        updateBuilderField(q.id, "content", e.target.value)
                      }
                      placeholder="Question text"
                      rows={2}
                      className={inputClassName}
                    />

                    {/* Options */}
                    {form.question_type === "multiple_choice" && (
                      <div className="space-y-2">
                        {form.options.map((opt, idx) => (
                          <div key={idx} className="flex items-center gap-3">
                            <button
                              onClick={() => setBuilderCorrect(q.id, idx)}
                              title={
                                idx === form.correct_index
                                  ? "Correct answer"
                                  : "Mark as correct"
                              }
                              className="shrink-0"
                            >
                              {idx === form.correct_index ? (
                                <FontAwesomeIcon
                                  icon={faCheck}
                                  className="w-5 h-5 text-green-600"
                                />
                              ) : (
                                <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                              )}
                            </button>
                            <input
                              value={opt}
                              onChange={(e) =>
                                updateBuilderOption(q.id, idx, e.target.value)
                              }
                              placeholder={`Option ${idx + 1}`}
                              className={inputClassName}
                            />
                            {form.options.length > 2 && (
                              <button
                                onClick={() => removeBuilderOption(q.id, idx)}
                                className="text-gray-400 hover:text-red-500 shrink-0"
                              >
                                <FontAwesomeIcon
                                  icon={faTimes}
                                  className="w-4 h-4"
                                />
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          onClick={() => addBuilderOption(q.id)}
                          className="text-sm text-[#1B6B7B] font-medium hover:underline"
                        >
                          + Add option
                        </button>
                      </div>
                    )}

                    {/* True / False */}
                    {form.question_type === "true_false" && (
                      <div className="space-y-2">
                        {["True", "False"].map((label, idx) => (
                          <div key={idx} className="flex items-center gap-3">
                            <button
                              onClick={() => setBuilderCorrect(q.id, idx)}
                              className="shrink-0"
                            >
                              {idx === form.correct_index ? (
                                <FontAwesomeIcon
                                  icon={faCheck}
                                  className="w-5 h-5 text-green-600"
                                />
                              ) : (
                                <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                              )}
                            </button>
                            <span className="text-sm text-gray-700">
                              {label}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Short answer */}
                    {form.question_type === "short_answer" && (
                      <p className="text-sm text-gray-400 italic">
                        Students will type a free-text response. Correct answer
                        matching is configured in the answer key.
                      </p>
                    )}

                    {/* Answer key row */}
                    <div className="flex items-center gap-4 pt-2 border-t border-gray-100">
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-600 font-medium">
                          Points
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={form.points}
                          onChange={(e) =>
                            updateBuilderField(
                              q.id,
                              "points",
                              Math.max(1, Number(e.target.value)),
                            )
                          }
                          className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#1B6B7B]/30"
                        />
                      </div>
                      {form.explanation && (
                        <span className="text-xs text-gray-400">
                          Has answer explanation
                        </span>
                      )}
                    </div>

                    {/* Save button */}
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleSaveQuestion(q.id)}
                        disabled={saving}
                        className="px-6 py-2 bg-[#1B6B7B] text-white rounded-lg text-sm font-medium hover:bg-[#155663] disabled:opacity-60 transition-colors"
                      >
                        {saving ? (
                          <span className="flex items-center gap-2">
                            <FontAwesomeIcon
                              icon={faSpinner}
                              spin
                              className="w-4 h-4"
                            />
                            Saving…
                          </span>
                        ) : (
                          "Save"
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
