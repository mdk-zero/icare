"use client";

import { useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faCheck, faLayerGroup } from "@fortawesome/free-solid-svg-icons";
import type { Section } from "../lib/api";
import { CardLabel } from "./Card";
import { EcgLoader } from "./EcgLoader";

/** Local YYYY-MM-DD. `toISOString()` would shift the day in most timezones. */
function isoDay(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export type PresetId = "7d" | "30d" | "3m" | "12m" | "ytd" | "custom";

const PRESETS: { id: PresetId; label: string }[] = [
  { id: "7d", label: "7 days" },
  { id: "30d", label: "30 days" },
  { id: "3m", label: "3 months" },
  { id: "12m", label: "12 months" },
  { id: "ytd", label: "This year" },
  { id: "custom", label: "Custom" },
];

/** Ranges are inclusive of both ends, matching the SQL `>= from and <= to`. */
export function rangeForPreset(preset: Exclude<PresetId, "custom">): { from: string; to: string } {
  const today = new Date();
  const from = new Date(today);
  switch (preset) {
    case "7d":
      from.setDate(from.getDate() - 6);
      break;
    case "30d":
      from.setDate(from.getDate() - 29);
      break;
    case "3m":
      from.setMonth(from.getMonth() - 3);
      break;
    case "12m":
      from.setFullYear(from.getFullYear() - 1);
      break;
    case "ytd":
      from.setMonth(0, 1);
      break;
  }
  return { from: isoDay(from), to: isoDay(today) };
}

export function formatRangeLabel(from: string, to: string): string {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = a.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const right = b.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${left} – ${right}`;
}

/** "All sections", a single section's name, or "3 sections". */
function sectionScopeLabel(sections: Section[], selected: string[]): string {
  // Empty selection means "everything" — the same thing the API does when no
  // section_ids are sent.
  if (selected.length === 0 || selected.length === sections.length) return "All sections";
  if (selected.length === 1) return sections.find((s) => s.id === selected[0])?.name ?? "1 section";
  return `${selected.length} sections`;
}

/** Multi-select over sections. */
function SectionPicker({
  sections,
  selected,
  counts,
  onChange,
}: {
  sections: Section[];
  selected: string[];
  counts?: Record<string, number>;
  onChange: (ids: string[]) => void;
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

  const allSelected = selected.length === 0 || selected.length === sections.length;

  const toggle = (id: string) => {
    const base = selected.length === 0 ? sections.map((s) => s.id) : selected;
    const next = base.includes(id) ? base.filter((s) => s !== id) : [...base, id];
    onChange(next);
  };

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={sections.length === 0}
        className="flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <FontAwesomeIcon icon={faLayerGroup} className="w-3.5 h-3.5 text-brand-600" />
        <span className="font-medium">{sectionScopeLabel(sections, selected)}</span>
        <FontAwesomeIcon icon={faChevronDown} className="w-3 h-3 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1.5 w-60 rounded-lg border border-hairline bg-surface p-1.5 shadow-overlay">
          <button
            type="button"
            onClick={() => onChange([])}
            className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-gray-700 hover:bg-subtle"
          >
            <span className="font-medium">All sections</span>
            {allSelected && <FontAwesomeIcon icon={faCheck} className="w-3 h-3 text-brand-600" />}
          </button>
          <div className="my-1 h-px bg-hairline" />
          {sections.map((section) => {
            const on = selected.length === 0 || selected.includes(section.id);
            const count = counts?.[section.id];
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => toggle(section.id)}
                className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-sm text-gray-700 hover:bg-subtle"
              >
                <span className="flex items-center gap-2 truncate">
                  <span
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      on ? "border-brand-600 bg-brand-600 text-white" : "border-gray-300"
                    }`}
                  >
                    {on && <FontAwesomeIcon icon={faCheck} className="w-2.5 h-2.5" />}
                  </span>
                  <span className="truncate">{section.name}</span>
                </span>
                {count !== undefined && (
                  <span className="ml-2 shrink-0 text-xs text-gray-400 tabular-nums">{count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * Section + date-range filters for the analytics dashboards: the section
 * multi-select, the preset range buttons, and custom start/end dates. The
 * page owns the state; this only draws it and reports changes.
 */
export default function AnalyticsFilterBar({
  sections,
  sectionIds,
  onSectionsChange,
  sectionCounts,
  preset,
  onPresetChange,
  draft,
  onDraftChange,
  range,
  refreshing,
}: {
  sections: Section[];
  sectionIds: string[];
  onSectionsChange: (ids: string[]) => void;
  sectionCounts?: Record<string, number>;
  preset: PresetId;
  onPresetChange: (id: PresetId) => void;
  /** What the custom date inputs show — may be half-typed or inverted. */
  draft: { from: string; to: string };
  onDraftChange: (edge: "from" | "to", value: string) => void;
  /** The applied range, shown as the read-out on the right. */
  range: { from: string; to: string };
  refreshing?: boolean;
}) {
  return (
    <div className="mb-6 rounded-xl border border-hairline bg-surface shadow-tile">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <CardLabel>Sections</CardLabel>
          <SectionPicker
            sections={sections}
            selected={sectionIds}
            counts={sectionCounts}
            onChange={onSectionsChange}
          />
        </div>

        <span className="hidden h-6 w-px bg-hairline sm:block" />

        <div className="flex items-center gap-2.5">
          <CardLabel>Range</CardLabel>
          <div className="flex flex-wrap items-center gap-1">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onPresetChange(p.id)}
                className={`rounded-lg px-2.5 py-1.5 text-sm transition-colors ${
                  preset === p.id
                    ? "bg-brand-600 text-white"
                    : "text-gray-600 hover:bg-subtle hover:text-gray-900"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {preset === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={draft.from}
              max={draft.to || undefined}
              onChange={(e) => onDraftChange("from", e.target.value)}
              className="rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-sm text-gray-700"
              aria-label="Range start"
            />
            <span className="text-gray-400">–</span>
            <input
              type="date"
              value={draft.to}
              min={draft.from || undefined}
              onChange={(e) => onDraftChange("to", e.target.value)}
              className="rounded-lg border border-hairline bg-surface px-2.5 py-1.5 text-sm text-gray-700"
              aria-label="Range end"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
          {refreshing && <EcgLoader size="xs" className="text-brand-600" />}
          <span className="tabular-nums">{formatRangeLabel(range.from, range.to)}</span>
        </div>
      </div>
    </div>
  );
}
