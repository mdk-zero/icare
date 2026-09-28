"use client";

import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPeopleGroup } from "@fortawesome/free-solid-svg-icons";
import Card from "../../components/Card";
import { fetchGroupSummaries, type GroupSummary } from "../../lib/api";
import { TARGET_SCORE } from "../../lib/performance-target";
import { usePageData } from "../../lib/use-page-data";

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

const SCALE = [0, 25, 50, 75, 100];

/** One measure as a bar, its value just past the end; no score yet reads as such. */
function Bar({
  value,
  grown,
  className,
  label,
}: {
  value: number | null;
  grown: boolean;
  className: string;
  label: string;
}) {
  if (value === null) {
    return (
      <div className="flex h-3 items-center">
        <span className="text-[11px] text-gray-400">{label}: not scored yet</span>
      </div>
    );
  }
  return (
    <div className="flex h-3 items-center gap-1.5" title={`${label}: ${value}%`}>
      <div
        className={`h-full rounded-r-full transition-[width] duration-700 ease-out ${className}`}
        style={{
          width: grown ? `${Math.min(Math.max(value, 0), 100)}%` : "0%",
        }}
      />
      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-gray-700">{value}%</span>
    </div>
  );
}

/**
 * One row per group: the patient case average (a group shares one case, so
 * it leads) over the quiz average, against a dashed line at the target. The
 * bars are measured in a box that stops short of the track's right edge, so a
 * 100% bar still has room for its label.
 */
function GroupBars({ groups }: { groups: GroupSummary[] }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const rowGrid = "grid grid-cols-[minmax(0,9rem)_1fr] gap-x-4 sm:grid-cols-[minmax(0,15rem)_1fr]";
  return (
    <div>
      <ul className="divide-y divide-hairline" aria-label="Group averages">
        {groups.map((g) => (
          <li
            key={g.team_id}
            className={rowGrid}
            aria-label={`${g.name}: patient case average ${pct(g.scenarios.average)}, quiz average ${pct(g.assessments.average)}`}
          >
            <div className="min-w-0 py-2.5">
              <p className="truncate text-sm font-medium text-gray-900">
                {g.section_name && <span className="text-gray-500">{g.section_name} · </span>}
                {g.name}
              </p>
              <p className="truncate text-[11px] text-gray-500">
                {g.faculty_name ?? "No supervisor"} · {g.members} {g.members === 1 ? "member" : "members"}
                {g.scenarios.graded > 0 && ` · ${g.scenarios.graded}/${g.scenarios.assigned} graded`}
              </p>
            </div>
            <div className="relative mr-10 flex flex-col justify-center gap-1 py-2.5" aria-hidden>
              <div
                className="pointer-events-none absolute inset-y-0 border-l border-dashed border-gray-400"
                style={{ left: `${TARGET_SCORE}%` }}
              />
              <Bar value={g.scenarios.average} grown={grown} className="bg-brand-600" label="Patient case" />
              <Bar value={g.assessments.average} grown={grown} className="bg-brand-300" label="Quiz" />
            </div>
          </li>
        ))}
      </ul>
      <div className={`${rowGrid} border-t border-hairline`} aria-hidden>
        <div />
        <div className="relative mr-10 h-5">
          {SCALE.map((v) => (
            <span
              key={v}
              className={`absolute top-1 -translate-x-1/2 text-[10px] tabular-nums ${
                v === TARGET_SCORE ? "font-semibold text-gray-700" : "text-gray-400"
              }`}
              style={{ left: `${v}%` }}
            >
              {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function GroupTable({ groups }: { groups: GroupSummary[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-[11px] uppercase tracking-wider text-gray-500">
          <tr className="border-b border-hairline">
            <th className="px-3 py-2 font-semibold">Group</th>
            <th className="px-3 py-2 font-semibold">Supervisor</th>
            <th className="px-3 py-2 text-right font-semibold">Members</th>
            <th className="px-3 py-2 text-right font-semibold">Patient case avg</th>
            <th className="px-3 py-2 text-right font-semibold">Graded</th>
            <th className="px-3 py-2 text-right font-semibold">Quiz avg</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {groups.map((g) => (
            <tr key={g.team_id}>
              <td className="px-3 py-2.5 font-medium text-gray-800">
                {g.section_name ? `${g.section_name} · ` : ""}
                {g.name}
              </td>
              <td className="px-3 py-2.5 text-gray-600">{g.faculty_name ?? "None"}</td>
              <td className="px-3 py-2.5 text-right tabular-nums text-gray-700">{g.members}</td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                {pct(g.scenarios.average)}
              </td>
              <td className="px-3 py-2.5 text-right tabular-nums text-gray-600">
                {g.scenarios.graded === 0 ? "—" : `${g.scenarios.graded}/${g.scenarios.assigned}`}
              </td>
              <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                {pct(g.assessments.average)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Every group in the faculty member's sections (or the sections picked in the
 * filter), with the mean of its members' individual scenario and Skill
 * Assessment grades. Read live, not from the warehouse, and all-time rather
 * than the date range, so it says so. Hidden when there are no groups.
 */
export default function GroupPerformance({ sectionIds }: { sectionIds: string[] }) {
  const { data } = usePageData("faculty:group-summaries", fetchGroupSummaries);
  const [view, setView] = useState<"chart" | "table">("chart");
  const groups = (data?.groups ?? []).filter(
    (g) => sectionIds.length === 0 || sectionIds.includes(g.section_id),
  );
  if (groups.length === 0) return null;

  return (
    <Card padding="md" className="mb-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-brand-600/10 p-2.5">
            <FontAwesomeIcon icon={faPeopleGroup} className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Performance by Group</h3>
            <p className="text-xs text-gray-400">Averages of each member&apos;s own grades, all time</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {view === "chart" && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> Patient case avg
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-sm bg-brand-300" /> Quiz avg
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-3 border-l border-dashed border-gray-500" /> Target {TARGET_SCORE}%
              </span>
            </div>
          )}
          <div className="flex rounded-lg border border-hairline p-0.5" role="group" aria-label="View">
            {(["chart", "table"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`rounded-md px-2 py-0.5 text-xs capitalize transition-colors ${
                  view === v ? "bg-brand-600 text-white" : "text-gray-500 hover:bg-subtle hover:text-gray-900"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === "table" ? <GroupTable groups={groups} /> : <GroupBars groups={groups} />}
    </Card>
  );
}
