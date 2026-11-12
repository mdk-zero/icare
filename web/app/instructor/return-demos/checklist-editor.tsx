"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowUp,
  faFileArrowUp,
  faListCheck,
  faPlus,
  faTrashCan,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { CHECKLIST_LIMITS, stepCount, type ChecklistRow, type ChecklistRowKind } from "../../lib/checklist-import";

type EditRow = ChecklistRow & { key: number };

let nextKey = 1;
const withKeys = (rows: readonly ChecklistRow[]): EditRow[] => rows.map((r) => ({ ...r, key: nextKey++ }));

/**
 * Check and fix a skills checklist before it goes on a Return Demonstration:
 * what was read from the uploaded file, or nothing when typing one in. Every
 * row can be edited, turned into a section heading or a step, moved, removed,
 * or have a row added below it. Each section becomes a task and its steps the
 * sub-tasks graded on the usual scale.
 */
export default function ChecklistEditor({
  initial,
  fileName,
  notice,
  onUse,
  onClose,
}: {
  initial: readonly ChecklistRow[];
  /** The file the rows were read from, if any. */
  fileName?: string;
  /** Said above the rows, e.g. that nothing could be read. */
  notice?: string;
  onUse: (rows: ChecklistRow[]) => void;
  onClose: () => void;
}) {
  const [rows, setRows] = useState<EditRow[]>(() =>
    // Typing one in starts with a section heading, since every step sits under one.
    initial.length ? withKeys(initial) : withKeys([{ kind: "section", text: "" }]),
  );
  /** A row just added, focused as it mounts. */
  const focusKey = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const cleaned = rows.map(({ kind, text }) => ({ kind, text: text.trim() })).filter((r) => r.text);
  const steps = stepCount(cleaned);
  const sections = cleaned.filter((r) => r.kind === "section").length;
  const full = rows.length >= CHECKLIST_LIMITS.rows;

  const update = (key: number, patch: Partial<ChecklistRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) => setRows((prev) => prev.filter((r) => r.key !== key));
  const move = (index: number, by: -1 | 1) =>
    setRows((prev) => {
      const next = [...prev];
      const [row] = next.splice(index, 1);
      next.splice(index + by, 0, row);
      return next;
    });
  const insert = (at: number, kind: ChecklistRowKind) => {
    if (full) return;
    const [row] = withKeys([{ kind, text: "" }]);
    focusKey.current = row.key;
    setRows((prev) => [...prev.slice(0, at), row, ...prev.slice(at)]);
  };

  // Steps are numbered through the whole checklist, as on the paper.
  const numbers = rows.reduce<number[]>(
    (acc, r) => [...acc, r.kind === "step" ? acc.filter((n) => n > 0).length + 1 : 0],
    [],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="checklist-editor-title"
        className="flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-hairline bg-subtle px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/10">
              <FontAwesomeIcon icon={faListCheck} className="h-5 w-5 text-brand-600" />
            </span>
            <div className="min-w-0">
              <h2 id="checklist-editor-title" className="font-display text-lg font-bold text-gray-900">
                Checklist
              </h2>
              <p className="truncate text-xs text-gray-500">
                {fileName ? (
                  <>
                    <FontAwesomeIcon icon={faFileArrowUp} className="mr-1 h-3 w-3" />
                    Read from {fileName}. Check each step, and fix or add any it missed.
                  </>
                ) : (
                  "Type each step, with a section heading above each group of steps."
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
          >
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto bg-gray-50/60 px-4 py-4 sm:px-6">
          {notice && (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-sm text-amber-800">{notice}</p>
          )}
          <ol className="space-y-2">
            {rows.map((row, i) => {
              const section = row.kind === "section";
              const stepNo = numbers[i];
              return (
                <li
                  key={row.key}
                  className={`group rounded-xl border bg-surface shadow-tile ${
                    section ? "mt-4 border-brand-600/30 border-l-4 border-l-brand-600" : "border-hairline"
                  }`}
                >
                  <div className="flex items-start gap-3 px-3 py-2.5">
                    <span
                      className={`mt-1.5 flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md px-1 text-xs font-bold tabular-nums ${
                        section ? "bg-brand-600/10 text-brand-700" : "bg-gray-100 text-gray-600"
                      }`}
                      aria-hidden
                    >
                      {section ? "§" : stepNo}
                    </span>
                    <textarea
                      ref={(el) => {
                        if (el && focusKey.current === row.key) {
                          focusKey.current = null;
                          el.focus();
                        }
                      }}
                      value={row.text}
                      onChange={(e) => update(row.key, { text: e.target.value })}
                      maxLength={CHECKLIST_LIMITS.text}
                      rows={1}
                      aria-label={section ? "Section heading" : `Step ${stepNo}`}
                      placeholder={section ? "Section heading, e.g. Preparing for delivery" : "What the student does"}
                      className={`min-h-[2.25rem] flex-1 resize-none rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-sm [field-sizing:content] hover:border-gray-200 focus:border-brand-600 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand-600/20 ${
                        section ? "font-semibold text-gray-900" : "text-gray-800"
                      }`}
                    />
                    <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
                      <select
                        value={row.kind}
                        onChange={(e) => update(row.key, { kind: e.target.value as ChecklistRowKind })}
                        aria-label="Row type"
                        className="rounded-lg border border-gray-200 bg-surface px-2 py-1 text-xs text-gray-700 focus:border-brand-600 focus:outline-none"
                      >
                        <option value="step">Step</option>
                        <option value="section">Section</option>
                      </select>
                      <div className="flex items-center">
                        <IconButton label="Move up" icon={faArrowUp} disabled={i === 0} onClick={() => move(i, -1)} />
                        <IconButton label="Move down" icon={faArrowDown} disabled={i === rows.length - 1} onClick={() => move(i, 1)} />
                        <IconButton label="Add a step below" icon={faPlus} disabled={full} onClick={() => insert(i + 1, "step")} />
                        <IconButton label="Delete row" icon={faTrashCan} danger onClick={() => remove(row.key)} />
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => insert(rows.length, "step")}
              disabled={full}
              className="inline-flex items-center gap-2 rounded-lg border border-dashed border-brand-600/50 bg-surface px-4 py-2 text-sm font-medium text-brand-700 hover:bg-brand-600/5 disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
              Add step
            </button>
            <button
              type="button"
              onClick={() => insert(rows.length, "section")}
              disabled={full}
              className="inline-flex items-center gap-2 rounded-lg border border-dashed border-gray-300 bg-surface px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
              Add section
            </button>
          </div>
          {full && <p className="mt-2 text-xs text-gray-500">A checklist can have up to {CHECKLIST_LIMITS.rows} rows.</p>}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-5 py-3">
          <p className="text-sm text-gray-600">
            <span className="font-semibold text-gray-900 tabular-nums">{steps}</span> step{steps === 1 ? "" : "s"}
            {sections > 0 && (
              <>
                {" "}in <span className="font-semibold text-gray-900 tabular-nums">{sections}</span> section{sections === 1 ? "" : "s"}
              </>
            )}
          </p>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-gray-200 bg-surface px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onUse(cleaned)}
              disabled={steps === 0}
              className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Use this checklist
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function IconButton({
  label,
  icon,
  onClick,
  disabled,
  danger,
}: {
  label: string;
  icon: typeof faPlus;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent ${
        danger ? "hover:text-red-600" : "hover:text-gray-700"
      }`}
    >
      <FontAwesomeIcon icon={icon} className="h-3.5 w-3.5" />
    </button>
  );
}
