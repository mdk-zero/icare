"use client";

import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPeopleGroup } from "@fortawesome/free-solid-svg-icons";
import Card from "../../components/Card";
import { fetchGroupSummaries } from "../../lib/api";
import { usePageData } from "../../lib/use-page-data";

const pct = (n: number | null) => (n === null ? "—" : `${n}%`);

/**
 * Every group in the faculty member's sections (or the sections picked in the
 * filter), with the mean of its members' individual scenario and Skill
 * Assessment grades. Read live, not from the warehouse, and all-time rather
 * than the date range, so it says so. Hidden when there are no groups.
 */
export default function GroupPerformance({ sectionIds }: { sectionIds: string[] }) {
  const { data } = usePageData("faculty:group-summaries", fetchGroupSummaries);
  const groups = (data?.groups ?? []).filter(
    (g) => sectionIds.length === 0 || sectionIds.includes(g.section_id),
  );
  if (groups.length === 0) return null;

  return (
    <Card padding="md" className="mb-4">
      <div className="mb-4 flex items-center gap-2.5">
        <div className="rounded-xl bg-brand-600/10 p-2.5">
          <FontAwesomeIcon icon={faPeopleGroup} className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Performance by Group</h3>
          <p className="text-xs text-gray-400">Averages of each member&apos;s own grades, all time</p>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-wider text-gray-500">
            <tr className="border-b border-hairline">
              <th className="px-3 py-2 font-semibold">Group</th>
              <th className="px-3 py-2 font-semibold">Supervisor</th>
              <th className="px-3 py-2 text-right font-semibold">Members</th>
              <th className="px-3 py-2 text-right font-semibold">Scenario avg</th>
              <th className="px-3 py-2 text-right font-semibold">Graded</th>
              <th className="px-3 py-2 text-right font-semibold">Skill Assessment avg</th>
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
                  {g.scenarios.graded}/{g.scenarios.assigned}
                </td>
                <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-gray-900">
                  {pct(g.assessments.average)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
