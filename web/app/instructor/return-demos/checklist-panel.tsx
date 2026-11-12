"use client";

import { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faFileArrowUp, faKeyboard, faListCheck, faPen } from "@fortawesome/free-solid-svg-icons";
import { readChecklistFile } from "../../lib/api";
import { CHECKLIST_ACCEPT, checklistTasks, stepCount, type ChecklistRow } from "../../lib/checklist-import";
import { EcgLoader } from "../../components/EcgLoader";
import ChecklistEditor from "./checklist-editor";

/**
 * The skills checklist on a Return Demonstration, in place of Taylor's
 * skills: upload the school's own checklist (PDF or Excel) or type it in,
 * check it in the editor, and see it here by section. `locked` says why it
 * can't change (students have been graded on it).
 */
export default function ChecklistPanel({
  rows,
  onChange,
  title,
  onSuggestTitle,
  disabled,
  locked,
}: {
  rows: ChecklistRow[];
  onChange: (rows: ChecklistRow[]) => void;
  /** The Return Demonstration's title, which names steps before the first section. */
  title: string;
  /** A title read from the file, offered when the title is still empty. */
  onSuggestTitle: (title: string) => void;
  disabled?: boolean;
  locked?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<{ rows: ChecklistRow[]; fileName?: string; notice?: string } | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const upload = async (file: File) => {
    setReading(true);
    setError(null);
    const result = await readChecklistFile(file);
    setReading(false);
    if (result.error || !result.checklist) {
      setError(result.error ?? "That file couldn't be read");
      return;
    }
    const { title: found, rows: read } = result.checklist;
    if (found) onSuggestTitle(found);
    setEditor({
      rows: read,
      fileName: file.name,
      notice:
        stepCount(read) === 0
          ? "No numbered steps were found in that file. It may be a scanned image. Type the steps in below."
          : undefined,
    });
  };

  const tasks = checklistTasks(rows, title);
  const steps = stepCount(rows);
  const busy = disabled || reading;

  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <div className="flex items-center gap-2">
        <FontAwesomeIcon icon={faListCheck} className="h-3.5 w-3.5 text-brand-600" />
        <p className="text-sm font-bold text-gray-800">Skills checklist</p>
      </div>
      <p className="mt-0.5 text-xs text-gray-500">
        Each section becomes a task, and its steps become the sub-tasks you grade on the usual scale.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept={CHECKLIST_ACCEPT}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void upload(file);
        }}
      />

      {steps === 0 ? (
        <div className="mt-3 flex flex-col items-center rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-4 py-8 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-600/10">
            <FontAwesomeIcon icon={faFileArrowUp} className="h-5 w-5 text-brand-600" />
          </span>
          <p className="mt-3 text-sm font-semibold text-gray-800">Upload your checklist</p>
          <p className="mt-1 max-w-sm text-xs text-gray-500">
            A PDF or Excel (.xlsx) file of the evaluation tool. You can check and fix every step before saving.
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {reading ? <EcgLoader /> : <FontAwesomeIcon icon={faFileArrowUp} className="h-4 w-4" />}
              {reading ? "Reading the file…" : "Upload checklist"}
            </button>
            <button
              type="button"
              onClick={() => setEditor({ rows: [] })}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            >
              <FontAwesomeIcon icon={faKeyboard} className="h-4 w-4" />
              Type it in
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-subtle px-3 py-2.5">
            <p className="text-sm text-gray-700">
              <span className="font-semibold text-gray-900 tabular-nums">{steps}</span> step{steps === 1 ? "" : "s"} in{" "}
              <span className="font-semibold text-gray-900 tabular-nums">{tasks.length}</span> section
              {tasks.length === 1 ? "" : "s"}
            </p>
            {locked ? (
              <span className="text-xs text-gray-500">{locked}</span>
            ) : (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditor({ rows })}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
                  Edit checklist
                </button>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-surface px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {reading ? <EcgLoader /> : <FontAwesomeIcon icon={faFileArrowUp} className="h-3 w-3" />}
                  {reading ? "Reading…" : "Upload a different file"}
                </button>
              </div>
            )}
          </div>
          <ul className="mt-3 space-y-2">
            {tasks.map((task, i) => (
              <li key={i} className="rounded-lg border border-hairline">
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left"
                >
                  <span className="min-w-0 flex-1 text-sm text-gray-800">
                    {task.title}
                    <span className="ml-1 text-xs text-gray-500">· {task.steps.length} steps</span>
                  </span>
                  <FontAwesomeIcon
                    icon={faChevronDown}
                    className={`h-3 w-3 shrink-0 text-gray-500 transition-transform ${open === i ? "rotate-180" : ""}`}
                  />
                </button>
                {open === i && (
                  <ol className="space-y-1.5 border-t border-hairline px-3 py-2 text-xs text-gray-700">
                    {task.steps.map((step, j) => (
                      <li key={j} className="flex gap-2">
                        <span className="w-5 shrink-0 text-right tabular-nums text-gray-400">{j + 1}.</span>
                        <span>{step}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2.5 text-sm text-red-700">
          {error}{" "}
          <button type="button" onClick={() => setEditor({ rows: [] })} className="font-semibold underline">
            Type it in instead
          </button>
        </p>
      )}

      {editor && (
        <ChecklistEditor
          initial={editor.rows}
          fileName={editor.fileName}
          notice={editor.notice}
          onClose={() => setEditor(null)}
          onUse={(next) => {
            onChange(next);
            setEditor(null);
          }}
        />
      )}
    </div>
  );
}
