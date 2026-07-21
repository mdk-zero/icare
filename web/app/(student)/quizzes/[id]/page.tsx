"use client";

import { useRouter, useParams } from "next/navigation";
import { useState, useEffect, useRef, useCallback } from "react";
import {
  getCurrentUser,
  startAssessmentAttempt,
  submitAssessmentAttempt,
  StartedAttempt,
  AttemptResult,
} from "../../../lib/api";

export default function TakeQuizPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const assessmentId = params.id;

  const [attempt, setAttempt] = useState<StartedAttempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number | null>>({});
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AttemptResult | null>(null);
  const questionStartRef = useRef<number>(0);
  const timeSpentRef = useRef<Record<string, number>>({});
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!getCurrentUser()) {
      router.push("/login");
      return;
    }
    let cancelled = false;
    startAssessmentAttempt(assessmentId).then((started) => {
      if (cancelled) return;
      if (!started) {
        setError("This quiz is not available right now.");
      } else {
        setAttempt(started);
        if (started.assessment.time_limit_seconds) {
          setSecondsLeft(started.assessment.time_limit_seconds);
        }
        questionStartRef.current = Date.now();
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [assessmentId, router]);

  const recordTimeSpent = useCallback((questionId: string) => {
    const elapsed = Math.round((Date.now() - questionStartRef.current) / 1000);
    timeSpentRef.current[questionId] =
      (timeSpentRef.current[questionId] ?? 0) + elapsed;
    questionStartRef.current = Date.now();
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!attempt || submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    const current = attempt.questions[currentIndex];
    if (current) recordTimeSpent(current.id);
    const payload = attempt.questions.map((q) => ({
      question_id: q.id,
      selected_index: answers[q.id] ?? null,
      time_spent_seconds: timeSpentRef.current[q.id] ?? 0,
    }));
    const res = await submitAssessmentAttempt(attempt.attempt.id, payload);
    if (!res) {
      submittedRef.current = false;
      setSubmitting(false);
      setError("Failed to submit your answers. Please try again.");
      return;
    }
    setResult(res);
    setSubmitting(false);
  }, [attempt, answers, currentIndex, recordTimeSpent]);

  // Countdown timer with auto-submit on expiry.
  useEffect(() => {
    if (secondsLeft === null || result) return;
    if (secondsLeft <= 0) {
      handleSubmit();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => (s === null ? null : s - 1)), 1000);
    return () => clearTimeout(t);
  }, [secondsLeft, result, handleSubmit]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div className="bg-surface p-10 rounded-2xl shadow-sm border border-gray-100 text-center">
        <p className="text-gray-600 mb-4">{error ?? "Quiz not found."}</p>
        <button
          onClick={() => router.push("/dashboard?tab=quizzes")}
          className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-[#155663]"
        >
          Back to Quizzes
        </button>
      </div>
    );
  }

  // ---------- Results view ----------
  if (result) {
    const questionById = new Map(attempt.questions.map((q) => [q.id, q]));
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="bg-surface p-8 rounded-2xl shadow-sm border border-gray-100 text-center">
          <p className="text-sm text-gray-500 mb-1">{attempt.assessment.title}</p>
          <p className="text-5xl font-bold text-brand-600 mb-2">{result.score}%</p>
          <p className="text-gray-600">
            {result.correct} of {result.total} correct ·{" "}
            {Math.floor(result.time_taken_seconds / 60)}m {result.time_taken_seconds % 60}s
          </p>
        </div>

        {result.criteria_breakdown && result.criteria_breakdown.length > 0 && (
          <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="font-semibold text-gray-800 mb-4">Competency Breakdown</h3>
            <div className="space-y-3">
              {result.criteria_breakdown.map((cb) => (
                <div key={cb.criteria_id}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="text-gray-700">{cb.criteria_name}</span>
                    <span className="font-medium text-gray-800">
                      {cb.score}% ({cb.correct}/{cb.total}) · {cb.weight}% weight
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2.5">
                    <div
                      className={`h-2.5 rounded-full transition-all ${
                        cb.score >= 75 ? "bg-emerald-500" : cb.score >= 50 ? "bg-amber-500" : "bg-red-500"
                      }`}
                      style={{ width: `${cb.score}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-4">
          {result.results.map((r, i) => {
            const q = questionById.get(r.question_id);
            if (!q) return null;
            return (
              <div
                key={r.question_id}
                className={`bg-surface p-6 rounded-2xl shadow-sm border ${
                  r.is_correct ? "border-green-200" : "border-red-200"
                }`}
              >
                <p className="font-medium text-gray-800 mb-3">
                  {i + 1}. {q.content}
                </p>
                <div className="space-y-2">
                  {q.options.map((opt, idx) => (
                    <div
                      key={idx}
                      className={`px-4 py-2 rounded-lg text-sm ${
                        idx === r.correct_index
                          ? "bg-green-50 text-green-800 border border-green-200"
                          : idx === r.selected_index
                          ? "bg-red-50 text-red-800 border border-red-200"
                          : "bg-gray-50 text-gray-600"
                      }`}
                    >
                      {opt}
                      {idx === r.correct_index && " ✓"}
                      {idx === r.selected_index && idx !== r.correct_index && " ✗"}
                    </div>
                  ))}
                </div>
                {r.explanation && (
                  <p className="mt-3 text-sm text-gray-500 bg-gray-50 rounded-lg p-3">
                    {r.explanation}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex justify-center pb-8">
          <button
            onClick={() => router.push("/dashboard?tab=quizzes")}
            className="px-8 py-3 bg-brand-600 text-white rounded-lg hover:bg-[#155663]"
          >
            Back to Quizzes
          </button>
        </div>
      </div>
    );
  }

  // ---------- Taking view ----------
  const question = attempt.questions[currentIndex];
  const isLast = currentIndex === attempt.questions.length - 1;
  const answeredCount = Object.values(answers).filter((a) => a !== null && a !== undefined).length;

  const goTo = (nextIndex: number) => {
    recordTimeSpent(question.id);
    setCurrentIndex(nextIndex);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-semibold text-gray-800">{attempt.assessment.title}</h2>
            <p className="text-sm text-gray-500">
              Question {currentIndex + 1} of {attempt.questions.length} · {answeredCount} answered
            </p>
          </div>
          {secondsLeft !== null && (
            <span
              className={`px-3 py-1.5 rounded-lg font-mono text-sm ${
                secondsLeft <= 60 ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-700"
              }`}
            >
              {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
            </span>
          )}
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className="bg-brand-600 h-2 rounded-full transition-all"
            style={{ width: `${((currentIndex + 1) / attempt.questions.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="bg-surface p-6 rounded-2xl shadow-sm border border-gray-100">
        <p className="font-medium text-gray-800 mb-4">{question.content}</p>
        <div className="space-y-2">
          {question.options.map((opt, idx) => (
            <button
              key={idx}
              onClick={() => setAnswers((prev) => ({ ...prev, [question.id]: idx }))}
              className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                answers[question.id] === idx
                  ? "border-brand-600 bg-brand-600/5 text-brand-600 font-medium"
                  : "border-gray-200 hover:border-gray-300 text-gray-700"
              }`}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-between pb-8">
        <button
          onClick={() => goTo(currentIndex - 1)}
          disabled={currentIndex === 0}
          className="px-6 py-2 rounded-lg border border-gray-200 text-gray-600 disabled:opacity-40 hover:bg-gray-50"
        >
          Previous
        </button>
        {isLast ? (
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="px-8 py-2 bg-brand-600 text-white rounded-lg hover:bg-[#155663] disabled:opacity-60"
          >
            {submitting ? "Submitting…" : "Submit Quiz"}
          </button>
        ) : (
          <button
            onClick={() => goTo(currentIndex + 1)}
            className="px-6 py-2 bg-brand-600 text-white rounded-lg hover:bg-[#155663]"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}
