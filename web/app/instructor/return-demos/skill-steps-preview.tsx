"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { fetchSkillDetails, type SkillSelection } from "../../lib/api";
import { usePageData } from "../../lib/use-page-data";
import { checklistOf } from "../scenarios/skill-checklist";

/**
 * The checklist each skill becomes: what the student will demonstrate and
 * you will grade, one row per step. A Taylor's skill shows the variant picked
 * (oral, rectal, axillary temperature...) and any edits made in the skill
 * editor; an own skill shows the steps written for it. This is what the
 * student sees.
 */
export default function SkillStepsPreview({ value }: { value: SkillSelection[] }) {
  // Taylor's skills still following the book need its steps, or its name when not renamed.
  const ids = value.filter((s) => !s.own && (!s.steps || !s.title)).map((s) => s.id);
  const { data: details } = usePageData(ids.length ? `skills:details:${ids.join(",")}` : null, () => fetchSkillDetails(ids), {
    freshFor: 10 * 60_000,
    keepPreviousData: true,
  });
  const [open, setOpen] = useState<string | null>(null);
  if (value.length === 0) return null;

  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <p className="text-sm font-bold text-gray-800">What students demonstrate</p>
      <p className="mt-0.5 text-xs text-gray-500">
        What students see and prepare from. Each step is graded Excellent, Satisfactory or Needs Practice.
      </p>
      <ul className="mt-3 space-y-2">
        {value.map((sel) => {
          const detail = (details ?? []).find((d) => d.id === sel.id);
          const steps = checklistOf(sel, detail);
          const name = sel.title || detail?.title || "";
          const isOpen = open === sel.id;
          return (
            <li key={sel.id} className="rounded-lg border border-hairline">
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : sel.id)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-2 px-3 py-2 text-left"
              >
                <span className="min-w-0 flex-1 text-sm text-gray-800">
                  <span className="font-mono text-xs text-indigo-700">{sel.own ? "Own skill" : `Skill ${sel.id}`}</span>{" "}
                  {name || <span className="text-gray-400">Untitled skill</span>}
                  {steps && <span className="ml-1 text-xs text-gray-500">· {steps.length} steps</span>}
                </span>
                <FontAwesomeIcon
                  icon={faChevronDown}
                  className={`h-3 w-3 shrink-0 text-gray-500 transition-transform ${isOpen ? "rotate-180" : ""}`}
                />
              </button>
              {isOpen && (
                <ol className="space-y-1.5 border-t border-hairline px-3 py-2 text-xs text-gray-700">
                  {steps === null ? (
                    <li className="text-gray-500">Loading the steps…</li>
                  ) : steps.length === 0 ? (
                    <li className="text-gray-500">No steps yet.</li>
                  ) : (
                    steps.map((st, i) => (
                      <li key={st.id ?? `${sel.id}-${i}`} className="flex gap-2">
                        <span className="w-5 shrink-0 text-right tabular-nums text-gray-400">{i + 1}.</span>
                        <span>{st.text}</span>
                      </li>
                    ))
                  )}
                </ol>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
