"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus, faXmark } from "@fortawesome/free-solid-svg-icons";
import type { CourseRequirement } from "../../../lib/api";
import { requirementDetail } from "../../../lib/course-progress";
import { TopicIcon, groupByTopic } from "../topics";

/**
 * Pick checklist items to file under one part or component of the grading
 * split. Only items not counted anywhere yet are offered; picking one files
 * it and keeps the list open for the next.
 */
export default function GradingItemPicker({
  leafLabel,
  items,
  names,
  onPick,
  onClose,
}: {
  /** "Written Exams › Midterm" */
  leafLabel: string;
  /** Gradeable items not filed anywhere. */
  items: CourseRequirement[];
  /** Requirement id → "Quiz #2". */
  names: Map<string, string>;
  onPick: (requirementId: string) => void;
  onClose: () => void;
}) {
  const sections = groupByTopic(items);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="grading-picker-title"
      >
        <div className="flex items-center justify-between border-b border-hairline bg-subtle px-5 py-3">
          <div className="min-w-0">
            <h2 id="grading-picker-title" className="font-display text-base font-semibold text-gray-900">
              Add items
            </h2>
            <p className="truncate text-sm text-gray-500">to {leafLabel}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-3">
          {items.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-gray-500">
              Every item that takes a score already counts somewhere. Remove one from its component to move it here.
            </p>
          ) : (
            sections.map(({ topic, items: group }) => (
              <div key={topic.key} className="mb-2 last:mb-0">
                <p className={`flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold ${topic.text}`}>
                  <TopicIcon topic={topic} size="sm" />
                  {topic.label}
                </p>
                {group.map(({ requirement }) => (
                  <button
                    key={requirement.id}
                    type="button"
                    onClick={() => onPick(requirement.id)}
                    className="group flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-subtle"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-800">{names.get(requirement.id)}</span>
                      <span className="block truncate text-xs text-gray-500">{requirementDetail(requirement)}</span>
                    </span>
                    <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5 shrink-0 text-gray-300 group-hover:text-brand-600" />
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="flex justify-end border-t border-hairline px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-surface px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
