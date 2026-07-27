"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faFileLines,
  faSpinner,
  faDownload,
  faSearch,
  faUserTie,
  faDoorOpen,
  faUsers,
  faFilePdf,
  faFileCsv,
  faBuilding,
} from "@fortawesome/free-solid-svg-icons";

type ReportType = "faculty" | "rooms" | "users" | "summary";
type Format = "pdf" | "csv";

interface ReportKind {
  type: ReportType;
  label: string;
  blurb: string;
  icon: IconDefinition;
  hasList: boolean;
  targetNoun: string;
}

const KINDS: ReportKind[] = [
  {
    type: "faculty",
    label: "Faculty",
    blurb: "Individual faculty profile with assigned sections and student counts.",
    icon: faUserTie,
    hasList: true,
    targetNoun: "faculty members",
  },
  {
    type: "rooms",
    label: "Rooms",
    blurb: "Room details, capacity, occupancy, and current assignments.",
    icon: faDoorOpen,
    hasList: true,
    targetNoun: "rooms",
  },
  {
    type: "users",
    label: "Users",
    blurb: "User account details, role, and activity summary.",
    icon: faUsers,
    hasList: true,
    targetNoun: "users",
  },
  {
    type: "summary",
    label: "Admin Summary",
    blurb: "Overview of all faculty, rooms, and users.",
    icon: faBuilding,
    hasList: false,
    targetNoun: "",
  },
];

interface Target {
  id: string;
  label: string;
  sub: string;
}

export default function AdminReportsClient() {
  const [kind, setKind] = useState<ReportType>("faculty");
  const [format, setFormat] = useState<Format>("pdf");
  const [targets, setTargets] = useState<Target[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = KINDS.find((k) => k.type === kind)!;

  const loadTargets = useCallback(async (type: ReportType) => {
    setLoading(true);
    setError(null);
    try {
      if (type === "faculty") {
        const res = await fetch("/api/admin/faculty", { credentials: "include" });
        const json = (await res.json()) as {
          faculty?: { id: string; name: string; email: string; sections: { id: string; name: string }[]; student_count: number }[];
        };
        setTargets(
          (json.faculty ?? []).map((f) => ({
            id: f.id,
            label: f.name,
            sub: `${f.email} · ${f.sections.length} section${f.sections.length === 1 ? "" : "s"}`,
          })),
        );
      } else if (type === "rooms") {
        const res = await fetch("/api/admin/rooms", { credentials: "include" });
        const json = (await res.json()) as {
          rooms?: { id: string; name: string; room_number: string; capacity: number; status: string; students_assigned: number }[];
        };
        setTargets(
          (json.rooms ?? []).map((r) => ({
            id: r.id,
            label: `${r.name} (${r.room_number})`,
            sub: `${r.students_assigned}/${r.capacity} occupied · ${r.status}`,
          })),
        );
      } else if (type === "users") {
        const res = await fetch("/api/admin/users?role=all", { credentials: "include" });
        const json = (await res.json()) as {
          users?: { id: string; name: string; email: string; role: string }[];
        };
        setTargets(
          (json.users ?? []).map((u) => ({
            id: u.id,
            label: u.name,
            sub: `${u.email} · ${u.role}`,
          })),
        );
      } else {
        setTargets([]);
      }
    } catch {
      setError("Unable to load the list for this report type.");
      setTargets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTargets(kind);
  }, [kind, loadTargets]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return targets.filter((t) => !q || t.label.toLowerCase().includes(q) || t.sub.toLowerCase().includes(q));
  }, [targets, search]);

  const generate = async (target?: Target) => {
    const key = target?.id ?? "all";
    setError(null);
    setBusy(key);
    try {
      const query = new URLSearchParams({ format });
      if (target) query.set("id", target.id);
      const res = await fetch(`/api/admin/reports/${kind}?${query}`, { credentials: "include" });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error || `Unable to generate this ${active.label.toLowerCase()} report`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      link.download = match?.[1] ?? `icare-admin-${kind}-report.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("Unable to generate report");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <div className="bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-4 sm:p-5 mb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-brand-600 rounded-full text-xs sm:text-sm font-medium w-fit mb-3">
              <FontAwesomeIcon icon={faFileLines} className="w-3.5 h-3.5" />
              Reports
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">Reports & Export</h1>
            <p className="text-gray-500 mt-1">Generate admin reports for faculty, rooms, and users</p>
          </div>
        </div>
      </div>

      {/* Report type */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 mb-3">
        {KINDS.map((k) => {
          const selected = k.type === kind;
          return (
            <button
              key={k.type}
              onClick={() => {
                setKind(k.type);
                setSearch("");
              }}
              aria-pressed={selected}
              className={`rounded-xl border p-3 text-left transition-all ${
                selected
                  ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600/30"
                  : "border-hairline bg-surface hover:border-brand-300 hover:bg-subtle"
              }`}
            >
              <FontAwesomeIcon
                icon={k.icon}
                className={`w-4 h-4 ${selected ? "text-brand-600" : "text-gray-400"}`}
              />
              <p
                className={`mt-2 text-sm font-semibold ${
                  selected ? "text-brand-700" : "text-gray-700"
                }`}
              >
                {k.label}
              </p>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-hairline bg-surface p-4 shadow-tile mb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-gray-600 max-w-xl">{active.blurb}</p>
          <div
            role="radiogroup"
            aria-label="Output format"
            className="flex shrink-0 items-center gap-1 rounded-lg bg-subtle p-1"
          >
            {(["pdf", "csv"] as Format[]).map((f) => (
              <button
                key={f}
                role="radio"
                aria-checked={format === f}
                onClick={() => setFormat(f)}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold transition-all ${
                  format === f
                    ? "bg-surface text-brand-700 shadow-tile"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                <FontAwesomeIcon icon={f === "pdf" ? faFilePdf : faFileCsv} className="w-3.5 h-3.5" />
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {error}
        </div>
      )}

      {!active.hasList ? (
        <div className="rounded-xl border border-hairline bg-surface p-8 text-center shadow-tile">
          <FontAwesomeIcon icon={faBuilding} className="mb-3 h-8 w-8 text-brand-600/40" />
          <p className="font-display text-lg font-semibold text-gray-900">Admin Summary</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            One {format.toUpperCase()} covering all faculty, rooms, and users.
          </p>
          <button
            onClick={() => generate()}
            disabled={busy !== null}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700 disabled:opacity-60"
          >
            <FontAwesomeIcon
              icon={busy ? faSpinner : faDownload}
              spin={busy !== null}
              className="h-3.5 w-3.5"
            />
            {busy ? "Generating…" : `Generate ${format.toUpperCase()}`}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="relative w-full lg:w-96">
              <FontAwesomeIcon
                icon={faSearch}
                className="absolute left-3 top-1/2 w-4 h-4 -translate-y-1/2 text-gray-500"
              />
              <input
                type="text"
                placeholder={`Search ${active.targetNoun}…`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-surface py-2.5 pl-10 pr-4 text-sm text-gray-900 shadow-sm placeholder:text-gray-500 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
              />
            </div>
            <button
              onClick={() => generate()}
              disabled={busy !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700 disabled:opacity-60"
            >
              <FontAwesomeIcon
                icon={busy === "all" ? faSpinner : faDownload}
                spin={busy === "all"}
                className="h-3.5 w-3.5"
              />
              {busy === "all" ? "Generating…" : `Export All ${active.label} (${targets.length})`}
            </button>
          </div>

          {loading ? (
            <div className="rounded-xl border border-hairline bg-surface p-8 shadow-tile">
              <div className="animate-pulse space-y-3">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <div className="h-4 bg-gray-200 rounded w-1/3" />
                    <div className="h-4 bg-gray-200 rounded w-1/4 ml-auto" />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-100 bg-subtle">
                    <tr>
                      <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        {active.label}
                      </th>
                      <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Report
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {filtered.map((target) => (
                      <tr key={target.id} className="transition-colors hover:bg-subtle">
                        <td className="px-4 py-3">
                          <p className="font-semibold text-gray-800">{target.label}</p>
                          <p className="text-xs text-gray-500">{target.sub}</p>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => generate(target)}
                            disabled={busy !== null}
                            className="inline-flex items-center gap-2 rounded-lg border border-brand-600/30 px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50 disabled:opacity-50"
                          >
                            <FontAwesomeIcon
                              icon={busy === target.id ? faSpinner : faDownload}
                              spin={busy === target.id}
                              className="h-3.5 w-3.5"
                            />
                            {busy === target.id ? "Generating…" : format.toUpperCase()}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={2} className="py-8 text-center text-gray-500">
                          {search
                            ? `No ${active.targetNoun} match your search`
                            : `No ${active.targetNoun} available yet`}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
