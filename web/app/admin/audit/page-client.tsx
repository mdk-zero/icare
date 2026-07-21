"use client";

import { useState, useEffect, useCallback } from "react";
import PageHeader from "../../components/PageHeader";

interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_role: "student" | "faculty" | "admin" | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  created_at: string;
  actor: { name: string; email: string } | null;
}

const PAGE_SIZE = 50;

const ROLE_BADGE: Record<string, string> = {
  admin: "bg-orange-50 text-orange-700",
  faculty: "bg-purple-50 text-purple-700",
  student: "bg-blue-50 text-blue-700",
};

function detailsText(details: Record<string, unknown>): string {
  if (typeof details.message === "string") return details.message;
  const parts = Object.entries(details)
    .filter(([key, value]) => key !== "migrated_from" && key !== "actor_name" && value != null)
    .map(([key, value]) => `${key}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`);
  return parts.join(", ");
}

function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export default function AdminAuditClient() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [entityTypes, setEntityTypes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // filters
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [entityFilter, setEntityFilter] = useState("all");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(page * PAGE_SIZE),
    });
    if (appliedSearch) params.set("q", appliedSearch);
    if (roleFilter !== "all") params.set("role", roleFilter);
    if (entityFilter !== "all") params.set("entity", entityFilter);
    if (fromDate) params.set("from", fromDate);
    if (toDate) params.set("to", toDate);

    const res = await fetch(`/api/admin/audit?${params.toString()}`, {
      credentials: "include",
    });
    if (res.ok) {
      const json = (await res.json()) as {
        logs: AuditRow[];
        total: number;
        entity_types: string[];
      };
      setLogs(json.logs ?? []);
      setTotal(json.total ?? 0);
      setEntityTypes(json.entity_types ?? []);
    }
    setLoading(false);
  }, [appliedSearch, roleFilter, entityFilter, fromDate, toDate, page]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  // Any filter change returns to the first page.
  const withPageReset = <T,>(setter: (v: T) => void) => (value: T) => {
    setter(value);
    setPage(0);
  };

  const exportCsv = () => {
    const header = "timestamp,actor,role,action,entity_type,entity_id,details,ip";
    const rows = logs.map((log) =>
      [
        log.created_at,
        log.actor?.name ?? "System",
        log.actor_role ?? "",
        log.action,
        log.entity_type ?? "",
        log.entity_id ?? "",
        detailsText(log.details),
        log.ip_address ?? "",
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `icare-activity-log-page${page + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(Math.ceil(total / PAGE_SIZE), 1);

  return (
    <div>
      <PageHeader
        badge={{
          icon: (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          label: "Activity Log",
        }}
        title="Activity Log"
        subtitle="Append-only audit trail of every action across all roles"
      />

      {/* Filters */}
      <div className="bg-surface rounded-xl p-4 border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <form
            className="lg:col-span-2 relative"
            onSubmit={(e) => {
              e.preventDefault();
              setAppliedSearch(search.trim());
              setPage(0);
            }}
          >
            <svg className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search actions… (press Enter)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-11 pr-4 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all"
            />
          </form>
          <select
            value={roleFilter}
            onChange={(e) => withPageReset(setRoleFilter)(e.target.value)}
            className="px-3 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all cursor-pointer"
          >
            <option value="all">All Roles</option>
            <option value="admin">Admin</option>
            <option value="faculty">Faculty</option>
            <option value="student">Student</option>
          </select>
          <select
            value={entityFilter}
            onChange={(e) => withPageReset(setEntityFilter)(e.target.value)}
            className="px-3 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all cursor-pointer"
          >
            <option value="all">All Entities</option>
            {entityTypes.map((t) => (
              <option key={t} value={t}>
                {t.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={fromDate}
            onChange={(e) => withPageReset(setFromDate)(e.target.value)}
            title="From date"
            className="px-3 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => withPageReset(setToDate)(e.target.value)}
            title="To date"
            className="px-3 py-2.5 bg-surface border border-gray-200 rounded-xl text-gray-700 focus:outline-none focus:ring-2 focus:ring-brand-600/50 focus:border-brand-600 transition-all"
          />
        </div>
      </div>

      {/* Result bar */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">
          {loading ? "Loading…" : `${total} event${total !== 1 ? "s" : ""} · page ${page + 1} of ${totalPages}`}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            disabled={logs.length === 0}
            className="px-4 py-2 bg-surface border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-all"
          >
            Export page as CSV
          </button>
          <span className="text-xs text-gray-400">Append-only — entries cannot be edited or deleted</span>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-subtle border-b border-gray-100">
              <tr>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Timestamp</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Actor</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Action</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Entity</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Details</th>
                <th className="text-left py-3 px-4 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    {Array.from({ length: 6 }).map((_, j) => (
                      <td key={j} className="py-3 px-4">
                        <div className="h-4 w-24 bg-gray-200 rounded" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-gray-400">
                    No activity matches these filters
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const details = detailsText(log.details);
                  return (
                    <tr key={log.id} className="hover:bg-subtle transition-colors">
                      <td className="py-3 px-4 text-gray-500 text-sm whitespace-nowrap">
                        {formatTimestamp(log.created_at)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 bg-gray-100 rounded-full flex items-center justify-center text-xs font-medium text-gray-600 shrink-0">
                            {(log.actor?.name ?? "S").charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-gray-800 text-sm font-medium truncate">
                              {log.actor?.name ??
                                (typeof log.details.actor_name === "string"
                                  ? log.details.actor_name
                                  : "System")}
                            </p>
                            {log.actor_role && (
                              <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${ROLE_BADGE[log.actor_role] ?? "bg-gray-100 text-gray-600"}`}>
                                {log.actor_role}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium bg-brand-600/10 text-brand-600">
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 whitespace-nowrap">
                        {log.entity_type ? (
                          <>
                            {log.entity_type.replaceAll("_", " ")}
                            {log.entity_id && (
                              <span className="text-gray-400 font-mono text-xs"> · {log.entity_id.slice(0, 8)}</span>
                            )}
                          </>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-sm text-gray-600 max-w-xs">
                        <span className="block truncate" title={details}>
                          {details || <span className="text-gray-300">—</span>}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-400 font-mono whitespace-nowrap">
                        {log.ip_address ?? "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && total > PAGE_SIZE && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 0))}
              disabled={page === 0}
              className="px-4 py-2 bg-surface border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-all"
            >
              ← Previous
            </button>
            <span className="text-sm text-gray-500">
              Page {page + 1} of {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
              disabled={page >= totalPages - 1}
              className="px-4 py-2 bg-surface border border-gray-200 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-50 disabled:opacity-50 transition-all"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
