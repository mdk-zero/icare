"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faCircleCheck, faClock, faFileLines } from "@fortawesome/free-solid-svg-icons";
import type { StudentQuizAttempt } from "../../../lib/api";
import { scoreDescriptor } from "../../../lib/task-ratings";
import { Sparkline } from "./skill-area-trend";

/** Text colour for a percentage: green from 80, amber from 60, else red. */
export function scoreColor(score: number): string {
  if (score >= 80) return "text-emerald-600";
  if (score >= 60) return "text-amber-600";
  return "text-red-600";
}

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** A duration in seconds, read as a person would say it. */
function formatDuration(seconds: number | null): string | null {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return null;
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  if (minutes < 60) return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
}

interface QuizGroup {
  key: string;
  title: string;
  /** Newest first, as the list shows them. */
  attempts: StudentQuizAttempt[];
}

/** Retakes of one quiz, together: by the quiz's id, else (older rows) its title. Newest quiz first. */
export function groupAttempts(records: StudentQuizAttempt[]): QuizGroup[] {
  const groups = new Map<string, QuizGroup>();
  for (const record of records) {
    const key = record.assessment_id ?? `title:${record.quiz_title}`;
    const group = groups.get(key) ?? { key, title: record.quiz_title, attempts: [] };
    group.attempts.push(record);
    groups.set(key, group);
  }
  const time = (a: StudentQuizAttempt) => (a.submitted_at ? new Date(a.submitted_at).getTime() : 0);
  for (const group of groups.values()) group.attempts.sort((a, b) => time(b) - time(a));
  return [...groups.values()].sort((a, b) => time(b.attempts[0]) - time(a.attempts[0]));
}

function ScoreBlock({ score, caption }: { score: number | null; caption?: string }) {
  return (
    <div className="shrink-0 text-right">
      <p className={`text-xl font-bold leading-none ${score !== null ? scoreColor(score) : "text-gray-400"}`}>
        {score !== null ? `${score}%` : "—"}
      </p>
      <p className="mt-1 text-[11px] text-gray-400">
        {caption ?? (score !== null ? scoreDescriptor(score) : "Not scored")}
      </p>
    </div>
  );
}

/** Correct answers and time taken for one attempt. */
function AttemptFacts({ attempt }: { attempt: StudentQuizAttempt }) {
  const duration = formatDuration(attempt.time_taken_seconds);
  const answered = attempt.total_questions !== null && attempt.total_questions > 0 ? attempt.total_questions : null;
  if (answered === null && !duration) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
      {answered !== null && (
        <span className="flex items-center gap-1">
          <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
          {attempt.correct_answers} / {answered} correct
        </span>
      )}
      {duration && (
        <span className="flex items-center gap-1">
          <FontAwesomeIcon icon={faClock} className="h-3 w-3" />
          {duration}
        </span>
      )}
    </div>
  );
}

function QuizIcon() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600/10 text-brand-600">
      <FontAwesomeIcon icon={faFileLines} className="h-4 w-4" />
    </span>
  );
}

/**
 * One row per quiz. A quiz taken once reads as before; a retaken one shows
 * its latest score, a line of every score oldest to newest (the dashed line is
 * the target), and opens to the log of each attempt.
 */
function QuizGroupRow({ group }: { group: QuizGroup }) {
  const [open, setOpen] = useState(false);
  const latest = group.attempts[0];

  if (group.attempts.length === 1) {
    return (
      <div className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
        <QuizIcon />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-gray-900">{group.title}</p>
          <p className="text-sm text-gray-500">{formatDateTime(latest.submitted_at)}</p>
          <div className="mt-1">
            <AttemptFacts attempt={latest} />
          </div>
        </div>
        <ScoreBlock score={latest.score} />
      </div>
    );
  }

  const scored = [...group.attempts].reverse().filter((a): a is StudentQuizAttempt & { score: number } => a.score !== null);
  const first = scored[0]?.score ?? null;
  const change = first !== null && latest.score !== null ? latest.score - first : null;
  const best = scored.length > 0 ? Math.max(...scored.map((a) => a.score)) : null;
  const panelId = `quiz-log-${group.key}`;

  return (
    <div className="rounded-lg bg-gray-50">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-center gap-3 rounded-lg p-3 text-left transition-colors hover:bg-gray-100"
      >
        <QuizIcon />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-gray-900">{group.title}</p>
          <p className="text-sm text-gray-500">
            {group.attempts.length} attempts · last {formatDateTime(latest.submitted_at)}
          </p>
          <p className="mt-1 text-xs text-gray-400">
            {best !== null && <>Best {best}%</>}
            {change !== null && scored.length > 1 && (
              <span
                className={`ml-2 font-semibold ${
                  change > 0 ? "text-emerald-600" : change < 0 ? "text-rose-600" : "text-gray-500"
                }`}
              >
                {change > 0 ? "+" : ""}
                {change} pts since first
              </span>
            )}
          </p>
        </div>
        {scored.length > 1 && (
          <span className="hidden sm:block">
            <Sparkline
              values={scored.map((a) => a.score)}
              label={`${group.title} scores, oldest to newest: ${scored.map((a) => `${a.score}%`).join(", ")}`}
            />
          </span>
        )}
        <ScoreBlock score={latest.score} caption="Latest" />
        <FontAwesomeIcon
          icon={faChevronDown}
          className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ol id={panelId} className="space-y-1 px-3 pb-3 sm:pl-15">
          {group.attempts.map((attempt, i) => (
            <li
              key={attempt.id}
              className="flex items-center gap-3 rounded-md border border-hairline bg-surface px-3 py-2"
            >
              <span className="w-16 shrink-0 text-xs font-semibold text-gray-500">
                Attempt {group.attempts.length - i}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm text-gray-700">{formatDateTime(attempt.submitted_at)}</p>
                <AttemptFacts attempt={attempt} />
              </div>
              <span
                className={`shrink-0 text-sm font-bold tabular-nums ${
                  attempt.score !== null ? scoreColor(attempt.score) : "text-gray-400"
                }`}
              >
                {attempt.score !== null ? `${attempt.score}%` : "—"}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** The Performance tab: the student's quiz results, one row per quiz. */
export default function QuizHistory({ records }: { records: StudentQuizAttempt[] }) {
  if (records.length === 0) {
    return <p className="py-8 text-center text-gray-500">No quiz attempts yet</p>;
  }
  return (
    <div className="space-y-2">
      {groupAttempts(records).map((group) => (
        <QuizGroupRow key={group.key} group={group} />
      ))}
    </div>
  );
}
