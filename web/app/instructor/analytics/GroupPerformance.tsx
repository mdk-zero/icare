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

/** One averaged kind of graded work, drawn as a column per group. */
interface Measure {
  key: string;
  label: string;
  color: string;
  value: (g: GroupSummary) => number | null;
}

/**
 * Patient Cases lead (a group shares one case), then quizzes; both are always
 * drawn. Case presentations and Return Demonstrations join only when some
 * group in view has one graded, so a class that doesn't use them keeps the
 * two-column chart. Their colours are the group palette's last two, which the
 * trend chart beside this card reaches only with a fifth or sixth group.
 */
const MEASURES: { measure: Measure; always: boolean }[] = [
  {
    measure: { key: "case", label: "Patient case", color: "var(--color-brand-600)", value: (g) => g.scenarios.average },
    always: true,
  },
  {
    measure: { key: "quiz", label: "Quiz", color: "var(--color-brand-300)", value: (g) => g.assessments.average },
    always: true,
  },
  {
    measure: {
      key: "presentation",
      label: "Case presentation",
      color: "var(--color-group-6)",
      value: (g) => g.case_presentations?.average ?? null,
    },
    always: false,
  },
  {
    measure: {
      key: "demo",
      label: "Return demo",
      color: "var(--color-group-5)",
      value: (g) => g.return_demos?.average ?? null,
    },
    always: false,
  },
];

function measuresFor(groups: GroupSummary[]): Measure[] {
  return MEASURES.filter(({ measure, always }) => always || groups.some((g) => measure.value(g) !== null)).map(
    ({ measure }) => measure,
  );
}

/**
 * Room per group, so a crowded chart scrolls sideways instead of squeezing
 * its columns. Past two measures the columns slim down, so three groups
 * still fit the card.
 */
const columnMinW = (measures: number) => (measures > 2 ? 24 + 18 * measures : 24 + 26 * measures);

/** One measure as a column, its value just above the top; no score yet reads as a dash. */
function Column({
  value,
  grown,
  color,
  label,
  slim,
}: {
  value: number | null;
  grown: boolean;
  color: string;
  label: string;
  slim: boolean;
}) {
  const width = slim ? "w-3.5" : "w-4 sm:w-5";
  if (value === null) {
    return (
      <div className={`flex h-full items-end justify-center ${width}`} title={`${label}: not scored yet`}>
        <span className="text-[11px] text-gray-400">—</span>
      </div>
    );
  }
  const height = `${Math.min(Math.max(value, 0), 100)}%`;
  return (
    <div className={`relative flex h-full items-end ${width}`} title={`${label}: ${value}%`}>
      <div
        className="w-full rounded-t-md transition-[height] duration-700 ease-out"
        style={{ height: grown ? height : "0%", backgroundColor: color }}
      />
      <span
        className="absolute left-1/2 -translate-x-1/2 text-[10px] font-semibold tabular-nums text-gray-700 transition-[bottom] duration-700 ease-out"
        style={{ bottom: `calc(${grown ? height : "0%"} + 3px)` }}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * One cluster of columns per group, a column per measure, against a dashed
 * line at the target. The y-axis stays put while a long row of groups scrolls
 * under it.
 */
function GroupBars({ groups, measures }: { groups: GroupSummary[]; measures: Measure[] }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Both the axis and the plot sit this far down, leaving room for a 100% label.
  const plot = "relative mt-5 h-56";
  return (
    <div className="flex">
      <div className={`${plot} w-8 shrink-0`} aria-hidden>
        {SCALE.map((v) => (
          <span
            key={v}
            className={`absolute right-2 translate-y-1/2 text-[10px] tabular-nums ${
              v === TARGET_SCORE ? "font-semibold text-gray-700" : "text-gray-400"
            }`}
            style={{ bottom: `${v}%` }}
          >
            {v}
          </span>
        ))}
      </div>

      <div className="min-w-0 flex-1 overflow-x-auto">
        <div style={{ minWidth: groups.length * columnMinW(measures.length) }}>
          <div className={`${plot} border-b border-gray-300`}>
            {SCALE.slice(1).map((v) => (
              <div
                key={v}
                className="pointer-events-none absolute inset-x-0 border-t border-hairline"
                style={{ bottom: `${v}%` }}
                aria-hidden
              />
            ))}
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-gray-500"
              style={{ bottom: `${TARGET_SCORE}%` }}
              aria-hidden
            />
            <ul className="absolute inset-0 flex" aria-label="Group averages">
              {groups.map((g) => (
                <li
                  key={g.team_id}
                  className={`flex flex-1 items-end justify-center px-1 ${measures.length > 2 ? "gap-1" : "gap-1.5"}`}
                  aria-label={`${g.section_name ? `${g.section_name} · ` : ""}${g.name}: ${measures
                    .map((m) => `${m.label.toLowerCase()} average ${pct(m.value(g))}`)
                    .join(", ")}`}
                >
                  {measures.map((m) => (
                    <Column
                      key={m.key}
                      value={m.value(g)}
                      grown={grown}
                      color={m.color}
                      label={m.label}
                      slim={measures.length > 2}
                    />
                  ))}
                </li>
              ))}
            </ul>
          </div>

          <div className="flex" aria-hidden>
            {groups.map((g) => (
              <div
                key={g.team_id}
                className="min-w-0 flex-1 px-1 pt-2 text-center"
                title={`${g.faculty_name ?? "No supervisor"} · ${g.members} ${g.members === 1 ? "member" : "members"}${
                  g.scenarios.graded > 0 ? ` · ${g.scenarios.graded}/${g.scenarios.assigned} graded` : ""
                }`}
              >
                {g.section_name && <p className="truncate text-[10px] text-gray-500">{g.section_name}</p>}
                <p className="truncate text-xs font-medium text-gray-900">{g.name}</p>
                <p className="truncate text-[10px] text-gray-400">
                  {g.members} {g.members === 1 ? "member" : "members"}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function GroupTable({ groups, measures }: { groups: GroupSummary[]; measures: Measure[] }) {
  const has = (key: string) => measures.some((m) => m.key === key);
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
            {has("presentation") && <th className="px-3 py-2 text-right font-semibold">Case presentation avg</th>}
            {has("demo") && <th className="px-3 py-2 text-right font-semibold">Return demo avg</th>}
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
              {has("presentation") && (
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                  {pct(g.case_presentations?.average ?? null)}
                </td>
              )}
              {has("demo") && (
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                  {pct(g.return_demos?.average ?? null)}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Every group in the faculty member's sections (or the sections picked in the
 * filter), with the mean of its members' individual grades per kind of work:
 * Patient Cases, quizzes, and case presentations and Return Demonstrations
 * once any are graded. Read live, not from the warehouse, and all-time rather
 * than the date range, so it says so. Hidden when there are no groups.
 */
export default function GroupPerformance({ sectionIds }: { sectionIds: string[] }) {
  const { data } = usePageData("faculty:group-summaries", fetchGroupSummaries);
  const [view, setView] = useState<"chart" | "table">("chart");
  const groups = (data?.groups ?? []).filter(
    (g) => sectionIds.length === 0 || sectionIds.includes(g.section_id),
  );
  if (groups.length === 0) return null;
  const measures = measuresFor(groups);

  return (
    <Card padding="md" className="flex flex-col">
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
              {measures.map((m) => (
                <span key={m.key} className="inline-flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: m.color }} /> {m.label} avg
                </span>
              ))}
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

      {view === "table" ? (
        <GroupTable groups={groups} measures={measures} />
      ) : (
        <GroupBars groups={groups} measures={measures} />
      )}
    </Card>
  );
}
