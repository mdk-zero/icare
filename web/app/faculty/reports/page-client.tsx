"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faFileLines,
  faSpinner,
  faDownload,
  faSearch,
  faUser,
  faLayerGroup,
  faNotesMedical,
  faListCheck,
  faUsers,
  faFilePdf,
  faFileCsv,
} from "@fortawesome/free-solid-svg-icons";
import {
  fetchFacultyStudents,
  fetchFacultySections,
  fetchFacultyScenarios,
} from "../../lib/api";
import { SkeletonTable } from "../../components/skeletons";
import PageHeader from "../../components/PageHeader";

type ReportType = "student" | "section" | "scenario" | "assessment" | "roster";
type Format = "pdf" | "csv";

interface ReportKind {
  type: ReportType;
  label: string;
  blurb: string;
  icon: IconDefinition;
  /** Roster covers the whole scope, so it has nothing to pick. */
  needsTarget: boolean;
  targetNoun: string;
}

const KINDS: ReportKind[] = [
  {
    type: "student",
    label: "Student",
    blurb: "Competency profile, quiz history and clinical activity for one student.",
    icon: faUser,
    needsTarget: true,
    targetNoun: "students",
  },
  {
    type: "section",
    label: "Section",
    blurb: "Whole-class roster, section averages and competency means.",
    icon: faLayerGroup,
    needsTarget: true,
    targetNoun: "sections",
  },
  {
    type: "scenario",
    label: "Scenario",
    blurb: "Who a scenario went to, completion rate and scores.",
    icon: faNotesMedical,
    needsTarget: true,
    targetNoun: "scenarios",
  },
  {
    type: "assessment",
    label: "Assessment",
    blurb: "Attempt counts, score distribution and pass rate for a quiz.",
    icon: faListCheck,
    needsTarget: true,
    targetNoun: "assessments",
  },
  {
    type: "roster",
    label: "Roster summary",
    blurb: "Every student you supervise, one row each — no need to pick a target.",
    icon: faUsers,
    needsTarget: false,
    targetNoun: "",
  },
];

interface Target {
  id: string;
  label: string;
  sub: string;
}

export default function FacultyReportsClient() {
  const [kind, setKind] = useState<ReportType>("student");
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
      if (type === "student") {
        const rows = await fetchFacultyStudents();
        setTargets(
          rows.map((s) => ({ id: s.id, label: s.name, sub: s.email })),
        );
      } else if (type === "section") {
        const rows = await fetchFacultySections();
        setTargets(rows.map((s) => ({ id: s.id, label: s.name, sub: "Section" })));
      } else if (type === "scenario") {
        const rows = await fetchFacultyScenarios();
        setTargets(
          rows.map((s) => ({
            id: s.id,
            label: s.title,
            sub: `${s.difficulty} · ${s.category} · ${s.student_count} assigned`,
          })),
        );
      } else if (type === "assessment") {
        const res = await fetch("/api/faculty/assessments", { credentials: "include" });
        const json = (await res.json()) as {
          assessments?: { id: string; title: string; difficulty: string; is_published: boolean }[];
        };
        setTargets(
          (json.assessments ?? []).map((a) => ({
            id: a.id,
            label: a.title,
            sub: `${a.difficulty} · ${a.is_published ? "Published" : "Draft"}`,
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
    // The target list is remote and keyed on the selected report type, so it
    // has to be fetched here rather than derived during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTargets(kind);
  }, [kind, loadTargets]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return targets.filter((t) => !q || t.label.toLowerCase().includes(q) || t.sub.toLowerCase().includes(q));
  }, [targets, search]);

  const generate = async (target?: Target) => {
    const key = target?.id ?? "roster";
    setError(null);
    setBusy(key);
    try {
      const query = new URLSearchParams({ format });
      if (target) query.set("id", target.id);
      const res = await fetch(`/api/faculty/reports/${kind}?${query}`, { credentials: "include" });

      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setError(json.error || `Unable to generate this ${active.label.toLowerCase()} report`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      // Prefer the filename the server chose, so PDF/CSV naming stays consistent.
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = disposition.match(/filename="([^"]+)"/);
      link.download = match?.[1] ?? `icare-${kind}-report.${format}`;
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
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faFileLines} className="w-3 h-3" />, label: "Reports" }}
        title="Reports"
        subtitle="Generate PDF or CSV reports for students, sections, scenarios and assessments"
      />

      {/* Report type */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 mb-3">
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

      {!active.needsTarget ? (
        <div className="rounded-xl border border-hairline bg-surface p-8 text-center shadow-tile">
          <FontAwesomeIcon icon={faUsers} className="mb-3 h-8 w-8 text-brand-600/40" />
          <p className="font-display text-lg font-semibold text-gray-900">Roster summary</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            One {format.toUpperCase()} covering every student in your sections.
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
          <div className="relative mb-3 w-full lg:w-96">
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

          {loading ? (
            <SkeletonTable rows={5} cols={2} />
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
