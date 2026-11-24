"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faChevronDown, faUserGroup } from "@fortawesome/free-solid-svg-icons";
import { WORK_KINDS, type WorkKind } from "../../lib/work-kinds";

export interface GroupChoice {
  id: string;
  name: string;
}

/** One group of the course at a time, or all of them. */
export function GroupPicker({
  groups,
  value,
  onChange,
}: {
  groups: GroupChoice[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selected = groups.find((g) => g.id === value) ?? null;
  const summary = selected?.name ?? "All groups";
  const pick = (id: string | null) => {
    setOpen(false);
    onChange(id);
  };
  const row =
    "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-gray-700 hover:bg-subtle";

  return (
    <div ref={boxRef} className="relative min-w-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={groups.length === 0}
        aria-expanded={open}
        aria-label={`Group: ${summary}`}
        className="flex max-w-full items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-50 w-full"
      >
        <FontAwesomeIcon icon={faUserGroup} className="h-3.5 w-3.5 shrink-0 text-brand-600" />
        <span className="truncate font-medium">{summary}</span>
        <FontAwesomeIcon icon={faChevronDown} className="h-3 w-3 shrink-0 text-gray-400" />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 max-h-72 w-60 overflow-y-auto rounded-lg border border-hairline bg-surface p-1.5 shadow-overlay">
          <button type="button" onClick={() => pick(null)} aria-pressed={value === null} className={row}>
            <span className="font-medium">All groups</span>
            {value === null && <FontAwesomeIcon icon={faCheck} className="h-3 w-3 text-brand-600" />}
          </button>
          {groups.map((g) => (
            <button key={g.id} type="button" onClick={() => pick(g.id)} aria-pressed={g.id === value} className={row}>
              <span className="truncate">{g.name}</span>
              {g.id === value && <FontAwesomeIcon icon={faCheck} className="h-3 w-3 shrink-0 text-brand-600" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The criteria a course's grade is made of — Patient Cases, Quizzes, Case
 * Presentations, Return Demonstrations — as toggles; only the kinds the course
 * has are offered. None on is every criterion.
 */
export function CriteriaFilter({
  available,
  selected,
  onChange,
}: {
  available: readonly WorkKind[];
  selected: WorkKind[];
  onChange: (kinds: WorkKind[]) => void;
}) {
  const offered = WORK_KINDS.filter((k) => available.includes(k.kind));
  if (offered.length === 0) return null;
  const toggle = (kind: WorkKind) =>
    onChange(selected.includes(kind) ? selected.filter((k) => k !== kind) : [...selected, kind]);

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Assessment criteria">
      <button
        type="button"
        onClick={() => onChange([])}
        aria-pressed={selected.length === 0}
        className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
          selected.length === 0 ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-subtle hover:text-gray-900"
        }`}
      >
        All
      </button>
      {offered.map(({ kind, label }) => {
        const on = selected.includes(kind);
        return (
          <button
            key={kind}
            type="button"
            onClick={() => toggle(kind)}
            aria-pressed={on}
            className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
              on ? "bg-brand-600 text-white" : "text-gray-600 hover:bg-subtle hover:text-gray-900"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
