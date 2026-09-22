"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faClipboard,
  faTriangleExclamation,
  faFlask,
  faFileLines,
  faClipboardCheck,
  faCircleInfo,
  faRightToBracket,
  faRightFromBracket,
  faMagnifyingGlass,
  faInbox,
} from "@fortawesome/free-solid-svg-icons";
import { fetchAuditTrail, AuditLog } from "../../lib/api";
import PageHeader from "../../components/PageHeader";
import StatTile from "../../components/StatTile";
import FilterSelect from "../../components/FilterSelect";
import { SkeletonStatTile } from "../../components/skeletons";
import { usePageData } from "../../lib/use-page-data";

/** Stable empty fallback, so no memo downstream sees a new array each render. */
const NO_LOGS: AuditLog[] = [];

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "student_detail" -> "Student detail" — the raw tab key, made presentable. */
function formatTab(tab: string): string {
  const words = tab.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const ACTION_STYLE: {
  match: (a: string) => boolean;
  color: string;
  icon: IconDefinition;
}[] = [
  {
    match: (a) => a.includes("alert"),
    color: "bg-red-50 text-red-700",
    icon: faTriangleExclamation,
  },
  {
    match: (a) => a.includes("scenario"),
    color: "bg-purple-50 text-purple-700",
    icon: faFlask,
  },
  {
    match: (a) => a.includes("report"),
    color: "bg-blue-50 text-blue-700",
    icon: faFileLines,
  },
  {
    match: (a) => a.includes("review"),
    color: "bg-emerald-50 text-emerald-700",
    icon: faClipboardCheck,
  },
  {
    match: (a) => a === "login",
    color: "bg-green-50 text-green-700",
    icon: faRightToBracket,
  },
  {
    match: (a) => a === "logout",
    color: "bg-gray-100 text-gray-700",
    icon: faRightFromBracket,
  },
];
const DEFAULT_ACTION_STYLE = {
  color: "bg-gray-50 text-gray-700",
  icon: faCircleInfo,
};

function actionStyle(action: string) {
  const lower = action.toLowerCase();
  return ACTION_STYLE.find((s) => s.match(lower)) ?? DEFAULT_ACTION_STYLE;
}

export default function FacultyAuditClient() {
  const [actionFilter, setActionFilter] = useState("all");
  const [search, setSearch] = useState("");

  const { data, loading } = usePageData(`faculty:audit:${actionFilter}`, () =>
    fetchAuditTrail(actionFilter !== "all" ? actionFilter : undefined),
  );
  const auditLogs = data ?? NO_LOGS;

  // The action filter round-trips to the server; free-text search narrows
  // what's already on screen, so it can filter as-you-type with no debounce.
  const q = search.trim().toLowerCase();
  const filteredLogs = q
    ? auditLogs.filter(
        (log) =>
          log.action.toLowerCase().includes(q) ||
          log.details.toLowerCase().includes(q) ||
          log.tab.toLowerCase().includes(q),
      )
    : auditLogs;

  const resultLabel = q
    ? `${filteredLogs.length} of ${auditLogs.length} event${auditLogs.length !== 1 ? "s" : ""}`
    : `${auditLogs.length} event${auditLogs.length !== 1 ? "s" : ""}`;

  return (
    <div>
      <PageHeader
        badge={{
          icon: (
            <FontAwesomeIcon icon={faClipboardCheck} className="w-3.5 h-3.5" />
          ),
          label: "Activity Log",
        }}
        title="Audit Trail"
        subtitle="Your activity history — every action you've taken, logged and unremovable"
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        {loading ? (
          <>
            <SkeletonStatTile />
            <SkeletonStatTile />
            <SkeletonStatTile />
          </>
        ) : (
          <>
            <StatTile
              icon={faClipboard}
              value={auditLogs.length}
              label="Total Activities"
              iconBg="bg-brand-600/10"
              iconColor="text-brand-600"
            />
            <StatTile
              icon={faTriangleExclamation}
              value={
                auditLogs.filter((a) =>
                  a.action.toLowerCase().includes("alert"),
                ).length
              }
              label="Alert Activities"
              iconBg="bg-red-50"
              iconColor="text-red-600"
            />
            <StatTile
              icon={faFlask}
              value={
                auditLogs.filter((a) =>
                  a.action.toLowerCase().includes("scenario"),
                ).length
              }
              label="Scenario Activities"
              iconBg="bg-purple-50"
              iconColor="text-purple-600"
            />
          </>
        )}
      </div>

      {/* Filters */}
      <div className="bg-surface rounded-xl p-4 border border-hairline shadow-tile mb-4">
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
          <div className="relative">
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="text"
              placeholder="Search actions, details, category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all"
            />
          </div>
          <FilterSelect
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
          >
            <option value="all">All Actions</option>
            <option value="alert">Alerts</option>
            <option value="scenario">Scenarios</option>
            <option value="report">Reports</option>
            <option value="review">Reviews</option>
            <option value="login">Logins</option>
            <option value="logout">Logouts</option>
          </FilterSelect>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {loading ? "Loading…" : resultLabel}
        </p>
        <p className="text-xs text-gray-400">
          The audit trail is append-only and cannot be edited or deleted.
        </p>
      </div>

      <div className="bg-surface rounded-xl border border-hairline shadow-tile overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-subtle border-b border-gray-100">
              <tr>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Timestamp
                </th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Action
                </th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="py-3.5 px-4">
                      <div className="h-3.5 w-28 bg-gray-100 rounded" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-6 w-24 bg-gray-100 rounded-full" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-3.5 w-20 bg-gray-100 rounded" />
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="h-3.5 w-56 bg-gray-100 rounded" />
                    </td>
                  </tr>
                ))
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-14 text-center">
                    <FontAwesomeIcon
                      icon={faInbox}
                      className="w-8 h-8 text-gray-300 mb-2"
                    />
                    <p className="text-gray-500 text-sm">
                      {auditLogs.length === 0
                        ? "No activity yet"
                        : "No activity matches these filters"}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const style = actionStyle(log.action);
                  return (
                    <tr
                      key={log.id}
                      className="hover:bg-subtle transition-colors"
                    >
                      <td className="py-3 px-4 text-gray-500 text-sm whitespace-nowrap">
                        {formatTimestamp(log.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap ${style.color}`}
                        >
                          <FontAwesomeIcon
                            icon={style.icon}
                            className="w-3 h-3"
                          />
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-500 whitespace-nowrap">
                        {formatTab(log.tab)}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 max-w-md">
                        <span className="block truncate" title={log.details}>
                          {log.details || (
                            <span className="text-gray-300">—</span>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
