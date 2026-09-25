"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBullseye, faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import type { FacultyReflection } from "../../../lib/api";

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" });

/** The student's reflections on graded work and the goals they set, newest first. */
export default function ReflectionsTab({
  reflections,
  enabled,
}: {
  reflections: FacultyReflection[] | null;
  enabled: boolean;
}) {
  if (!enabled) {
    return <p className="py-8 text-center text-gray-500">Reflections appear once database migration 050 is applied.</p>;
  }
  if (reflections === null) return <p className="py-8 text-center text-gray-500">Loading reflections…</p>;
  if (reflections.length === 0) {
    return (
      <p className="py-8 text-center text-gray-500">
        No reflections yet. Students reflect and set goals after a scenario is finalized or a skill assessment is scored.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {reflections.map((r) => (
        <li key={r.id} className="rounded-xl border border-hairline p-4">
          <div className="mb-2 flex flex-wrap items-baseline gap-x-2">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-gray-500">
              {r.source_type === "scenario" ? "Scenario" : "Skill assessment"}
            </span>
            <span className="font-semibold text-gray-900">{r.title}</span>
            {r.score !== null && <span className="text-sm tabular-nums text-gray-500">{r.score}%</span>}
            <span className="ml-auto text-xs text-gray-400">{formatDay(r.updated_at)}</span>
          </div>
          {r.reflection ? (
            <p className="whitespace-pre-wrap text-sm text-gray-800">{r.reflection}</p>
          ) : (
            <p className="text-sm italic text-gray-400">No written reflection.</p>
          )}
          {r.goals.length > 0 && (
            <ul className="mt-3 space-y-1">
              {r.goals.map((g) => (
                <li key={g.id} className="flex items-start gap-2 text-sm">
                  <FontAwesomeIcon
                    icon={g.status === "met" ? faCircleCheck : faBullseye}
                    className={`mt-1 h-3 w-3 shrink-0 ${g.status === "met" ? "text-emerald-600" : "text-brand-600"}`}
                  />
                  <span className={g.status === "met" ? "text-gray-500 line-through" : "text-gray-700"}>{g.text}</span>
                  {g.status === "met" && g.met_at && <span className="ml-auto text-xs text-gray-400">met {formatDay(g.met_at)}</span>}
                </li>
              ))}
            </ul>
          )}
          {r.feedback_summary && (
            <p className="mt-3 rounded-lg bg-subtle px-3 py-2 text-xs text-gray-600">
              <span className="font-semibold">Feedback the student read:</span> {r.feedback_summary}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
