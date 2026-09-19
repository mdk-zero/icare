"use client";

import { useRef, useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileImport,
  faTimes,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import { analyzeLesson, type AnalyzedLesson, type LessonTopic } from "../lib/api";
import { EcgLoader } from "./EcgLoader";

const LESSON_ACCEPT =
  ".pdf,.doc,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown";

export interface ImportedLesson extends AnalyzedLesson {
  fileName: string;
}

/**
 * An imported lesson and the topics picked from it. Picking a file uploads it
 * straight away: the server extracts the text (kept here, so generating later
 * doesn't upload it again) and proposes the categories it covers, all ticked
 * to start with. Nothing is created until the page acts on `selectedTopics`.
 */
export function useLessonImport({ onAnalyzed }: { onAnalyzed?: (lesson: ImportedLesson) => void } = {}) {
  const [lesson, setLesson] = useState<ImportedLesson | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Bumped on every pick and on remove, so a slow analysis of a file that has
  // since been replaced or removed can't land on top of the current one.
  const requestRef = useRef(0);

  const analyze = async (file: File) => {
    const request = ++requestRef.current;
    setAnalyzing(file.name);
    setError(null);
    setLesson(null);
    setSelected([]);
    const result = await analyzeLesson(file);
    if (request !== requestRef.current) return;
    setAnalyzing(null);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    const imported = { ...result, fileName: file.name };
    setLesson(imported);
    setSelected(result.topics.map((t) => t.category));
    onAnalyzed?.(imported);
  };

  const remove = () => {
    requestRef.current++;
    setLesson(null);
    setSelected([]);
    setAnalyzing(null);
    setError(null);
  };

  const toggle = (category: string) =>
    setSelected((prev) =>
      prev.includes(category) ? prev.filter((c) => c !== category) : [...prev, category],
    );

  /** Marks topics as existing once their categories are created, in the stored spelling. */
  const markCreated = (stored: string[]) => {
    const byKey = new Map(stored.map((name) => [name.toLowerCase(), name]));
    const rename = (category: string) => byKey.get(category.toLowerCase()) ?? category;
    setLesson((prev) =>
      prev && {
        ...prev,
        topics: prev.topics.map((t) =>
          byKey.has(t.category.toLowerCase())
            ? { ...t, category: rename(t.category), is_new: false }
            : t,
        ),
      },
    );
    setSelected((prev) => prev.map(rename));
  };

  // Topic order, not tick order: the first topic is the lesson's main one.
  const selectedTopics: LessonTopic[] = lesson
    ? lesson.topics.filter((t) => selected.includes(t.category))
    : [];

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
    selected,
    selectedTopics,
    analyzing,
    error,
    pick: () => inputRef.current?.click(),
    remove,
    toggle,
    markCreated,
    fileInput,
  };
}

export type LessonImport = ReturnType<typeof useLessonImport>;

/**
 * The imported file, its detected topics as a checklist, and whatever the
 * page wants to say or offer about them (`children`).
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
  const { lesson, selected, analyzing, error, remove, toggle } = lessonImport;
  if (!lesson && !analyzing && !error) return null;

  return (
    <div className="space-y-2">
      {(lesson || analyzing) && (
        <div className="flex items-center gap-2 px-3 py-2 bg-surface border border-brand-600/30 rounded-lg text-sm text-gray-700">
          {analyzing ? (
            <EcgLoader className="text-brand-600 shrink-0" />
          ) : (
            <FontAwesomeIcon icon={faFileImport} className="w-3.5 h-3.5 text-brand-600 shrink-0" />
          )}
          <span className="truncate flex-1" title={lesson?.fileName ?? analyzing ?? ""}>
            {analyzing ? `Reading ${analyzing} and finding its topics…` : lesson?.fileName}
          </span>
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
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {lesson?.warning && (
        <p className="flex items-start gap-1.5 text-xs text-amber-700">
          <FontAwesomeIcon icon={faTriangleExclamation} className="w-3 h-3 mt-0.5 shrink-0" />
          {lesson.warning}
        </p>
      )}

      {lesson && lesson.topics.length > 0 && (
        <div className="rounded-lg border border-hairline bg-surface p-3 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.06em] text-gray-600">
            Topics in this lesson
          </p>
          <div className="space-y-1.5">
            {lesson.topics.map((t) => (
              <label
                key={t.category}
                className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-subtle cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(t.category)}
                  onChange={() => toggle(t.category)}
                  disabled={disabled}
                  className="mt-0.5 w-4 h-4 accent-brand-600 shrink-0"
                />
                <span className="min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium text-gray-800">{t.category}</span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                        t.is_new ? "bg-brand-600/10 text-brand-700" : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {t.is_new ? "New category" : "Existing category"}
                    </span>
                  </span>
                  {t.topic && <span className="block text-xs text-gray-500 mt-0.5">{t.topic}</span>}
                </span>
              </label>
            ))}
          </div>
          {children}
        </div>
      )}
    </div>
  );
}
