"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBullseye,
  faCircleCheck,
  faLightbulb,
  faPenToSquare,
  faPlus,
  faRobot,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  fetchReflection,
  requestReflectionFeedback,
  saveReflection,
  type ReflectionFeedback,
  type ReflectionSource,
  type ReflectionState,
} from "../lib/api";
import { EcgLoader } from "./EcgLoader";
import { toast } from "./Toast";

const MAX_GOALS = 3;

const LEVEL_TONE: Record<string, string> = {
  Excellent: "bg-emerald-100 text-emerald-800",
  Satisfactory: "bg-blue-100 text-blue-800",
  "Needs Practice": "bg-amber-100 text-amber-800",
};

/**
 * After a scenario is finalized or a skill assessment is scored: the grade on
 * each Taylor's skill, feedback on strengths and what to improve (generated
 * only when asked), and the student's reflection with up to three goals.
 */
export default function ReflectionPanel({ source, sourceId }: { source: ReflectionSource; sourceId: string }) {
  const [state, setState] = useState<ReflectionState | null | undefined>(undefined);
  const [feedback, setFeedback] = useState<ReflectionFeedback | null>(null);
  const [asking, setAsking] = useState(false);
  const [text, setText] = useState("");
  const [goals, setGoals] = useState<{ text: string; skill_id: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(true);

  useEffect(() => {
    let live = true;
    void fetchReflection(source, sourceId).then((loaded) => {
      if (!live) return;
      setState(loaded);
      if (loaded) {
        setFeedback(loaded.feedback_stale ? null : loaded.feedback);
        setText(loaded.reflection?.text ?? "");
        setGoals(loaded.goals.map((g) => ({ text: g.text, skill_id: g.skill_id })));
        setEditing(!loaded.reflection);
      }
    });
    return () => {
      live = false;
    };
  }, [source, sourceId]);

  if (state === undefined) {
    return (
      <div className="rounded-xl border border-hairline bg-surface p-5 text-center">
        <EcgLoader className="text-brand-600" />
      </div>
    );
  }
  if (state === null) return null;

  const ask = async () => {
    setAsking(true);
    const result = await requestReflectionFeedback(source, sourceId);
    setAsking(false);
    if ("error" in result) toast(result.error);
    else setFeedback(result);
  };

  const save = async () => {
    setSaving(true);
    const result = await saveReflection(
      source,
      sourceId,
      text,
      goals.filter((g) => g.text.trim()),
    );
    setSaving(false);
    if ("error" in result) {
      toast(result.error);
      return;
    }
    toast("Reflection saved");
    setEditing(false);
  };

  const addGoal = (goalText = "") =>
    setGoals((prev) => (prev.length >= MAX_GOALS ? prev : [...prev, { text: goalText, skill_id: null }]));

  return (
    <section className="space-y-4 rounded-xl border border-hairline bg-surface p-5 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <header>
        <h2 className="text-base font-bold text-gray-900">Reflect on your results</h2>
        <p className="text-xs text-gray-500">How you did on each skill, what to work on, and the goals you set.</p>
      </header>

      {/* Per-skill grades */}
      {state.work.items.length > 0 && (
        <ul className="divide-y divide-hairline rounded-lg border border-hairline">
          {state.work.items.map((item) => (
            <li key={item.title} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 text-sm text-gray-800">{item.title}</span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${LEVEL_TONE[item.level] ?? "bg-gray-100 text-gray-700"}`}>
                  {item.level}
                </span>
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-gray-500">{item.score}%</span>
              </div>
              {item.remarks && <p className="mt-1 text-xs italic text-gray-600">Instructor: “{item.remarks}”</p>}
            </li>
          ))}
        </ul>
      )}

      {/* Feedback */}
      {feedback ? (
        <div className="space-y-3 rounded-lg bg-brand-600/5 p-3">
          <p className="text-sm text-gray-800">{feedback.summary}</p>
          {feedback.strengths.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" /> Strengths
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-gray-700">
                {feedback.strengths.map((s, i) => <li key={i}>{s.note}</li>)}
              </ul>
            </div>
          )}
          {feedback.improvements.length > 0 && (
            <div>
              <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                <FontAwesomeIcon icon={faLightbulb} className="h-3 w-3" /> To improve
              </p>
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-gray-700">
                {feedback.improvements.map((s, i) => <li key={i}>{s.note}</li>)}
              </ul>
            </div>
          )}
          {editing && feedback.suggested_goals.length > 0 && goals.length < MAX_GOALS && (
            <div className="flex flex-wrap gap-1.5">
              {feedback.suggested_goals
                .filter((g) => !goals.some((mine) => mine.text === g))
                .map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => addGoal(g)}
                    className="inline-flex items-center gap-1 rounded-full border border-brand-600/40 bg-surface px-2.5 py-1 text-xs text-brand-700 hover:bg-brand-600/5"
                  >
                    <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5" /> {g}
                  </button>
                ))}
            </div>
          )}
          {feedback.source === "rules" && (
            <p className="text-[11px] text-gray-500">Based on your grades — AI feedback is unavailable right now.</p>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={ask}
          disabled={asking}
          className="inline-flex items-center gap-2 rounded-lg border border-brand-600/40 bg-surface px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-600/5 disabled:opacity-50"
        >
          {asking ? <EcgLoader className="text-brand-600" /> : <FontAwesomeIcon icon={faRobot} className="h-3.5 w-3.5" />}
          {asking ? "Reading your results…" : state.feedback_stale ? "Refresh feedback" : "Get feedback"}
        </button>
      )}

      {/* Reflection + goals */}
      {!state.enabled ? (
        <p className="text-xs text-gray-500">Reflections open once the database is updated (migration 050).</p>
      ) : editing ? (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm font-semibold text-gray-800">Your reflection</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="What went well? What would you do differently next time, and why?"
              className="w-full resize-y rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-800 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30"
            />
          </label>
          <div>
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-800">
              <FontAwesomeIcon icon={faBullseye} className="h-3.5 w-3.5 text-brand-600" /> Goals
              <span className="font-normal text-gray-500">(up to {MAX_GOALS})</span>
            </p>
            <div className="space-y-2">
              {goals.map((g, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    value={g.text}
                    maxLength={300}
                    onChange={(e) => setGoals((prev) => prev.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    placeholder="e.g. Count every irregular pulse for a full minute"
                    aria-label={`Goal ${i + 1}`}
                    className="min-w-0 flex-1 rounded-lg border border-gray-300 bg-surface px-3 py-1.5 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setGoals((prev) => prev.filter((_, j) => j !== i))}
                    aria-label={`Remove goal ${i + 1}`}
                    className="grid h-7 w-7 place-items-center rounded-md text-gray-400 hover:bg-subtle hover:text-gray-700"
                  >
                    <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                  </button>
                </div>
              ))}
              {goals.length < MAX_GOALS && (
                <button
                  type="button"
                  onClick={() => addGoal()}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-900"
                >
                  <FontAwesomeIcon icon={faPlus} className="h-3 w-3" /> Add a goal
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={save}
            disabled={saving || (!text.trim() && !goals.some((g) => g.text.trim()))}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving && <EcgLoader />}
            Save reflection
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {text && <p className="whitespace-pre-wrap text-sm text-gray-800">{text}</p>}
          {goals.length > 0 && (
            <ul className="space-y-1">
              {goals.map((g, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                  <FontAwesomeIcon icon={faBullseye} className="mt-1 h-3 w-3 text-brand-600" />
                  {g.text}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-900"
          >
            <FontAwesomeIcon icon={faPenToSquare} className="h-3 w-3" /> Edit reflection
          </button>
        </div>
      )}
    </section>
  );
}
