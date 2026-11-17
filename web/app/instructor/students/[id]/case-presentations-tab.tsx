"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronRight, faFilePrescription } from "@fortawesome/free-solid-svg-icons";
import type { StudentCase } from "../../../lib/student-cases";

const STATUS: Record<string, { label: string; tone: string }> = {
  not_started: { label: "Not handed in", tone: "bg-gray-100 text-gray-600" },
  draft: { label: "Not handed in", tone: "bg-gray-100 text-gray-600" },
  submitted: { label: "Handed in", tone: "bg-sky-50 text-sky-700" },
  graded: { label: "Graded", tone: "bg-emerald-50 text-emerald-700" },
};

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

/**
 * A student's case presentations: each one their group reports, where it
 * stands and its grade. Grading happens on the presentation's own page, which
 * each row opens.
 */
export default function CasePresentationsTab({ cases }: { cases: StudentCase[] | null }) {
  if (cases === null) {
    return (
      <div className="space-y-3" aria-hidden>
        {[0, 1].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-gray-100" />
        ))}
      </div>
    );
  }
  if (cases.length === 0) return <p className="py-8 text-center text-gray-500">No case presentations for this student yet</p>;

  return (
    <ul className="space-y-3">
      {cases.map((c) => {
        const status = STATUS[c.status] ?? STATUS.not_started;
        return (
          <li key={c.id}>
            <Link
              href={`/instructor/cases/${c.presentation.id}`}
              className="flex items-center gap-4 rounded-xl border border-hairline bg-surface p-4 transition-colors hover:border-brand-600/40 hover:bg-subtle"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/10 text-brand-600">
                <FontAwesomeIcon icon={faFilePrescription} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold text-gray-900">{c.presentation.title}</span>
                <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                  <span className={`rounded-full px-2 py-0.5 font-medium ${status.tone}`}>{status.label}</span>
                  {c.late && <span className="rounded-full bg-red-50 px-2 py-0.5 font-medium text-red-700">Late</span>}
                  <span>
                    {c.group_name}
                    {c.is_leader ? ", leader" : ""}
                  </span>
                  {c.presentation.deadline && <span>Due {day(c.presentation.deadline)}</span>}
                </span>
              </span>
              <span className="shrink-0 text-right">
                {c.score !== null ? (
                  <span className="text-xl font-bold tabular-nums text-gray-900">{Math.round(c.score)}%</span>
                ) : (
                  <span className="text-sm text-gray-400">No grade yet</span>
                )}
              </span>
              <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3 shrink-0 text-gray-400" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
