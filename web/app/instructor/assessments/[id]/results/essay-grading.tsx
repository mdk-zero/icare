"use client";

import { useCallback, useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFeatherPointed, faXmark } from "@fortawesome/free-solid-svg-icons";
import { fetchQuizEssays, gradeEssays, type EssayAttempt } from "../../../../lib/api";
import { EcgLoader } from "../../../../components/EcgLoader";
import { toast } from "../../../../components/Toast";

type Draft = Record<string, { points: string; feedback: string }>;

const draftKey = (attemptId: string, questionId: string) => `${attemptId}:${questionId}`;

function formatDate(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * A student's essays (097) on one quiz, newest try first. Claude grades each
 * essay when the student hands it in; this is where the instructor reads the
 * answer and the AI's points and feedback, and changes them. An essay the AI
 * could not grade is left empty for the instructor to grade. A grade the
 * instructor saves replaces the AI's; each Save scores that try again.
 */
export default function EssayGradingModal({
  assessmentId,
  student,
  onClose,
  onGraded,
}: {
  assessmentId: string;
  student: { id: string; name: string };
  onClose: () => void;
  /** After a save, so the results table can refresh its grades. */
  onGraded: () => void;
}) {
  const [attempts, setAttempts] = useState<EssayAttempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({});
  const [saving, setSaving] = useState<string | null>(null);

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchQuizEssays>>) => {
    setAttempts(result.attempts);
    setError(result.attempts.length === 0 ? (result.error ?? null) : null);
    const next: Draft = {};
    for (const a of result.attempts) {
      for (const e of a.essays) {
        next[draftKey(a.attempt_id, e.question_id)] = {
          points: e.points_awarded === null ? "" : String(e.points_awarded),
          feedback: e.feedback ?? "",
        };
      }
    }
    setDraft(next);
  }, []);

  useEffect(() => {
    let live = true;
    void fetchQuizEssays(assessmentId, student.id).then((result) => {
      if (live) apply(result);
    });
    return () => {
      live = false;
    };
  }, [assessmentId, student.id, apply]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async (attempt: EssayAttempt) => {
    const grades: { question_id: string; points: number; feedback: string | null }[] = [];
    for (const e of attempt.essays) {
      const entry = draft[draftKey(attempt.attempt_id, e.question_id)];
      if (!entry || entry.points.trim() === "") continue;
      const points = Number(entry.points);
      if (!Number.isInteger(points) || points < 0 || points > e.max_points) {
        toast(`Give a whole number from 0 to ${e.max_points}`);
        return;
      }
      const feedback = entry.feedback.trim() || null;
      // An essay left as it was graded isn't sent, so an AI grade you didn't touch stays the AI's.
      if (e.points_awarded === points && (e.feedback?.trim() || null) === feedback) continue;
      grades.push({ question_id: e.question_id, points, feedback });
    }
    if (grades.length === 0) {
      toast("Nothing changed. Change an essay's points or feedback, then save.");
      return;
    }
    setSaving(attempt.attempt_id);
    const result = await gradeEssays(attempt.attempt_id, grades);
    setSaving(null);
    if (result.error) {
      toast(result.error);
      return;
    }
    toast(result.awaiting_grading ? "Grades saved. An essay on this try is still ungraded." : `Graded. Score: ${Math.round(result.score ?? 0)}%`);
    onGraded();
    apply(await fetchQuizEssays(assessmentId, student.id));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="essay-grading-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline bg-subtle px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/10">
              <FontAwesomeIcon icon={faFeatherPointed} className="h-4 w-4 text-brand-600" />
            </span>
            <div className="min-w-0">
              <h2 id="essay-grading-title" className="font-display text-lg font-semibold text-gray-900">
                Grade essays
              </h2>
              <p className="truncate text-sm text-gray-500">{student.name}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 [scrollbar-width:thin]">
          {attempts === null && (
            <div className="flex justify-center py-10">
              <EcgLoader />
            </div>
          )}
          {attempts !== null && attempts.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-500">{error ?? "No essays on this quiz from this student yet."}</p>
          )}
          {attempts?.map((attempt, index) => (
            <section key={attempt.attempt_id} className="overflow-hidden rounded-xl border border-hairline">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline bg-subtle px-4 py-2.5">
                <p className="text-sm font-semibold text-gray-800">
                  {attempts.length > 1 ? `Try ${attempts.length - index} · ` : ""}
                  {formatDate(attempt.submitted_at)}
                </p>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    attempt.awaiting_grading ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                  }`}
                >
                  {attempt.awaiting_grading ? "To grade" : `Graded · ${Math.round(attempt.score ?? 0)}%`}
                </span>
              </header>
              <div className="divide-y divide-hairline">
                {attempt.essays.map((essay) => {
                  const key = draftKey(attempt.attempt_id, essay.question_id);
                  const entry = draft[key] ?? { points: "", feedback: "" };
                  const set = (patch: Partial<typeof entry>) =>
                    setDraft((prev) => ({ ...prev, [key]: { ...entry, ...patch } }));
                  return (
                    <div key={essay.question_id} className="space-y-3 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-gray-900">{essay.question}</p>
                        {essay.ai_graded && (
                          <span
                            title="Claude graded this when the student handed it in. Change the points or feedback and save to replace it."
                            className="shrink-0 rounded-full bg-brand-600/10 px-2.5 py-0.5 text-xs font-semibold text-brand-700"
                          >
                            Graded by AI
                          </span>
                        )}
                      </div>
                      <div className="rounded-lg border border-hairline bg-surface px-3 py-2.5">
                        {essay.answer_text ? (
                          <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">{essay.answer_text}</p>
                        ) : (
                          <p className="text-sm italic text-gray-400">Left blank, so it was graded 0.</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                        <label className="flex shrink-0 items-center gap-2 text-sm text-gray-600">
                          Points
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={essay.max_points}
                            step={1}
                            value={entry.points}
                            onChange={(e) => set({ points: e.target.value })}
                            className="w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm tabular-nums text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                          />
                          <span className="tabular-nums text-gray-500">/ {essay.max_points}</span>
                        </label>
                        <textarea
                          value={entry.feedback}
                          onChange={(e) => set({ feedback: e.target.value })}
                          placeholder="Feedback for the student (optional)"
                          rows={2}
                          maxLength={2000}
                          className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              <footer className="flex justify-end border-t border-hairline bg-subtle px-4 py-2.5">
                <button
                  type="button"
                  onClick={() => void save(attempt)}
                  disabled={saving !== null}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
                >
                  {saving === attempt.attempt_id && <EcgLoader size="xs" />}
                  Save changes
                </button>
              </footer>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
