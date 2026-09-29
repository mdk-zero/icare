"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileImport,
  faTimes,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import {
  analyzeLesson,
  type AnalyzedLesson,
  type LessonImportProgress,
  type LessonTopic,
} from "../lib/api";
import { EcgLoader } from "./EcgLoader";
import { ACTIVE_CHAPTERS } from "../../scripts/taylors-chapters";

const LESSON_ACCEPT =
  ".pdf,.doc,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

/** The generators' lesson budget (MAX_LESSON_CHARS in lib/ai/lesson.ts, server-only). */
const LESSON_TEXT_BUDGET = 15_000;

/** Rows of a group shown before "Show all"; a whole book has eighteen chapters. */
const ROWS_SHOWN = 5;

const STAGE_LABEL: Record<LessonImportProgress["stage"], string> = {
  uploading: "Uploading",
  reading: "Reading",
  topics: "Finding topics in",
};

export interface ImportedLesson extends AnalyzedLesson {
  fileName: string;
}

/**
 * An imported lesson and the topics picked from it. Picking a file uploads it
 * straight away: the server extracts the text (kept here, so generating later
 * doesn't upload it again) and finds its topics. Taylor's is the standard, so
 * the book's chapters it covers come first. What starts ticked: the core
 * chapters it covers, else all its chapters, else its new topics. Nothing is
 * created until the page acts on `selectedTopics`.
 */
export function useLessonImport({
  onAnalyzed,
}: { onAnalyzed?: (lesson: ImportedLesson, ticked: LessonTopic[]) => void } = {}) {
  const [lesson, setLesson] = useState<ImportedLesson | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [progress, setProgress] = useState<LessonImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Bumped on every pick and on remove, so a slow analysis of a file that has
  // since been replaced or removed can't land on top of the current one.
  const requestRef = useRef(0);

  // Finding topics is one AI call with nothing to report, so the bar eases
  // toward 99% meanwhile rather than sitting still.
  useEffect(() => {
    if (progress?.stage !== "topics") return;
    const timer = setInterval(
      () => setProgress((p) => (p && p.stage === "topics" ? { ...p, percent: Math.min(99, p.percent + 1) } : p)),
      700,
    );
    return () => clearInterval(timer);
  }, [progress?.stage]);

  const analyze = async (file: File) => {
    const request = ++requestRef.current;
    setAnalyzing(file.name);
    setProgress({ stage: "uploading", percent: 0 });
    setError(null);
    setLesson(null);
    setSelected([]);
    const result = await analyzeLesson(file, (p) => {
      // Never step backwards (a late upload event after reading has begun).
      if (request === requestRef.current) setProgress((prev) => (prev && prev.percent > p.percent ? prev : p));
    });
    if (request !== requestRef.current) return;
    setAnalyzing(null);
    setProgress(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const imported = { ...result, fileName: file.name };
    setLesson(imported);
    const chapters = result.topics.filter((t) => t.chapter !== null);
    const core = chapters.filter((t) => ACTIVE_CHAPTERS.includes(t.chapter!));
    const ticked = core.length > 0 ? core : chapters.length > 0 ? chapters : result.topics;
    setSelected(ticked.map((t) => t.category));
    onAnalyzed?.(imported, ticked);
  };

  const remove = () => {
    requestRef.current++;
    setLesson(null);
    setSelected([]);
    setAnalyzing(null);
    setProgress(null);
    setError(null);
  };

  const toggle = (category: string) =>
    setSelected((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );

  // Topic order, not tick order: the first topic is the lesson's main one.
  const selectedTopics: LessonTopic[] = lesson
    ? lesson.topics.filter((t) => selected.includes(t.category))
    : [];

  // A long Taylor's file comes with each topic's own section: generate from
  // the ticked ones, sharing the budget, instead of the default excerpt.
  const tickedSections = selectedTopics
    .map((t) => lesson?.sections?.[t.category])
    .filter((text): text is string => Boolean(text));
  const lessonText = !lesson
    ? undefined
    : tickedSections.length > 0
      ? tickedSections
          .map((text) => text.slice(0, Math.floor(LESSON_TEXT_BUDGET / tickedSections.length)))
          .join("\n\n")
      : lesson.lessonText;

  const fileInput = (
    <input
      ref={inputRef}
      type="file"
      accept={LESSON_ACCEPT}
      className="hidden"
      onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) void analyze(file);
        // Cleared so picking the same file again after removing it still fires.
        e.target.value = "";
      }}
    />
  );

  return {
    lesson,
    lessonText,
    selected,
    selectedTopics,
    analyzing,
    progress,
    error,
    pick: () => inputRef.current?.click(),
    remove,
    toggle,
    fileInput,
  };
}

export type LessonImport = ReturnType<typeof useLessonImport>;

function TopicRow({
  topic,
  checked,
  disabled,
  onToggle,
}: {
  topic: LessonTopic;
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-subtle cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={disabled}
        className="mt-0.5 w-4 h-4 accent-brand-600 shrink-0"
      />
      <span className="min-w-0">
        <span className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-gray-800">{topic.category}</span>
          {topic.chapter !== null ? (
            <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-brand-600/10 text-brand-700">
              Chapter {topic.chapter}
            </span>
          ) : (
            <span className="px-1.5 py-0.5 rounded text-[11px] font-medium border border-dashed border-brand-400 text-brand-700">
              New topic
            </span>
          )}
        </span>
        {topic.topic && <span className="block text-xs text-gray-500 mt-0.5">{topic.topic}</span>}
      </span>
    </label>
  );
}

/** One group of topic rows; long groups collapse, never hiding a ticked row. */
function TopicGroup({
  title,
  hint,
  topics,
  selected,
  disabled,
  onToggle,
}: {
  title: string;
  hint?: string;
  topics: LessonTopic[];
  selected: string[];
  disabled?: boolean;
  onToggle: (category: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  if (topics.length === 0) return null;
  const shown = showAll
    ? topics
    : topics.filter((t, i) => i < ROWS_SHOWN || selected.includes(t.category));
  return (
    <div className="space-y-1.5">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-gray-600">{title}</p>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
      </div>
      {shown.map((t) => (
        <TopicRow
          key={t.category}
          topic={t}
          checked={selected.includes(t.category)}
          disabled={disabled}
          onToggle={() => onToggle(t.category)}
        />
      ))}
      {shown.length < topics.length && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="px-2 text-xs font-medium text-brand-700 hover:text-brand-900"
        >
          Show all {topics.length}
        </button>
      )}
    </div>
  );
}

/**
 * The imported file (with a percentage while it is read), its detected topics
 * as a checklist, and whatever the page wants to say or offer about them
 * (`children`).
 */
export function LessonPanel({
  lessonImport,
  disabled,
  children,
}: {
  lessonImport: LessonImport;
  disabled?: boolean;
  children?: ReactNode;
}) {
  const { lesson, selected, analyzing, progress, error, remove, toggle } = lessonImport;
  if (!lesson && !analyzing && !error) return null;

  const chapters = lesson?.topics.filter((t) => t.chapter !== null) ?? [];
  const fresh = lesson?.topics.filter((t) => t.chapter === null) ?? [];
  const percent = progress?.percent ?? 0;

  return (
    <div className="space-y-2">
      {(lesson || analyzing) && (
        <div className="px-3 py-2 bg-surface border border-brand-600/30 rounded-lg text-sm text-gray-700">
          <div className="flex items-center gap-2">
            {analyzing ? (
              <EcgLoader className="text-brand-600 shrink-0" />
            ) : (
              <FontAwesomeIcon icon={faFileImport} className="w-3.5 h-3.5 text-brand-600 shrink-0" />
            )}
            <span className="truncate flex-1" title={lesson?.fileName ?? analyzing ?? ""}>
              {analyzing
                ? `${STAGE_LABEL[progress?.stage ?? "uploading"]} ${analyzing}…`
                : lesson?.fileName}
            </span>
            {analyzing && (
              <span className="text-xs font-semibold tabular-nums text-brand-700">{percent}%</span>
            )}
            <button
              type="button"
              onClick={remove}
              disabled={disabled}
              aria-label="Remove lesson"
              className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faTimes} className="w-3.5 h-3.5" />
            </button>
          </div>
          {analyzing && (
            <div
              role="progressbar"
              aria-label="Importing lesson"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="mt-2 h-1.5 rounded-full bg-brand-600/10 overflow-hidden"
            >
              <div
                className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {lesson?.warning && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700">
          <FontAwesomeIcon icon={faTriangleExclamation} className="w-3 h-3 mt-0.5 shrink-0" />
          {lesson.warning}
        </p>
      )}

      {lesson && lesson.topics.length > 0 && (
        <div className="rounded-lg border border-hairline bg-surface p-3 space-y-3">
          <TopicGroup
            title="Taylor's chapters"
            topics={chapters}
            selected={selected}
            disabled={disabled}
            onToggle={toggle}
          />
          <TopicGroup
            title="New topics"
            hint="Not in Taylor's checklists. Cases on them still follow Taylor's wherever one of its skills applies."
            topics={fresh}
            selected={selected}
            disabled={disabled}
            onToggle={toggle}
          />
          {children}
        </div>
      )}
    </div>
  );
}
