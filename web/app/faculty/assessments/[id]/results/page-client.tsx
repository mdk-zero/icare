"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faClipboardCheck,
  faCircleCheck,
  faHourglassHalf,
  faCircleMinus,
  faSearch,
  faDownload,
  faChartSimple,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../../../components/PageHeader";
import StatTile from "../../../../components/StatTile";
import Avatar from "../../../../components/Avatar";
import { SkeletonTable } from "../../../../components/skeletons";

type Status = "submitted" | "in_progress" | "not_started";

interface StudentResult {
  student_id: string;
  name: string;
  email: string;
  picture_url: string | null;
  section: string | null;
  status: Status;
  attempt_count: number;
  submitted_count: number;
  best_score: number | null;
  latest_score: number | null;
  latest_submitted_at: string | null;
  latest_time_taken_seconds: number | null;
}

interface Summary {
  total: number;
  submitted: number;
  in_progress: number;
  not_started: number;
  average_score: number | null;
}

interface AssessmentRef {
  id: string;
  title: string;
  total_questions: number | null;
  max_attempts: number | null;
  is_published: boolean;
}

const STATUS_LABEL: Record<Status, string> = {
  submitted: "Completed",
  in_progress: "In progress",
  not_started: "Not started",
};

const STATUS_BADGE: Record<Status, string> = {
  submitted: "bg-emerald-50 text-emerald-700 border-emerald-200",
  in_progress: "bg-amber-50 text-amber-700 border-amber-200",
  not_started: "bg-gray-100 text-gray-500 border-gray-200",
};

function formatDateTime(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return minutes > 0 ? `${minutes}m ${rest}s` : `${rest}s`;
}

/** Blank for an ungraded row rather than a 0%, which would read as a failure. */
function formatScore(score: number | null): string {
  return score === null ? "—" : `${Math.round(score)}%`;
}

export default function AssessmentResultsClient({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [assessment, setAssessment] = useState<AssessmentRef | null>(null);
  const [results, setResults] = useState<StudentResult[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/faculty/assessments/${assessmentId}/results`, {
      credentials: "include",
    });
    const json = (await res.json()) as {
      assessment?: AssessmentRef;
      results?: StudentResult[];
      summary?: Summary;
      error?: string;
    };
    if (!res.ok) {
      setError(json.error ?? "Unable to load results.");
      setLoading(false);
      return;
    }
    setAssessment(json.assessment ?? null);
    setResults(json.results ?? []);
    setSummary(json.summary ?? null);
    setLoading(false);
  }, [assessmentId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return results.filter((r) => {
      const matchesSearch =
        !q || r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
      return matchesSearch && (statusFilter === "all" || r.status === statusFilter);
    });
  }, [results, search, statusFilter]);

  /** Exports what is on screen, so a filtered view exports the filtered rows. */
  const exportCsv = () => {
    const header = "student,email,section,status,best_score,attempts,last_submitted,time_taken";
    const rows = filtered.map((r) =>
      [
        r.name,
        r.email,
        r.section ?? "",
        STATUS_LABEL[r.status],
        r.best_score ?? "",
        r.attempt_count,
        r.latest_submitted_at ?? "",
        r.latest_time_taken_seconds ?? "",
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(","),
    );
    const blob = new Blob([[header, ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${assessment?.title ?? "assessment"}-results.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faClipboardCheck} className="w-3.5 h-3.5" />,
          label: "Assessment Results",
        }}
        title={assessment?.title ?? "Results"}
        subtitle="How each of your students performed on this assessment"
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => router.push(`/faculty/assessments/${assessmentId}`)}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" />
          Back to assessment
        </button>
        {assessment && !assessment.is_published && (
          <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            Draft — students cannot take this yet
          </span>
        )}
        <button
          onClick={exportCsv}
          disabled={filtered.length === 0}
          className="ml-auto flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-40"
        >
          <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5" />
          Export CSV
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700">
          {error}
        </div>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              icon={<FontAwesomeIcon icon={faCircleCheck} className="h-5 w-5" />}
              value={summary?.submitted ?? 0}
              label="Completed"
              caption={`of ${summary?.total ?? 0} student${summary?.total === 1 ? "" : "s"}`}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
            />
            <StatTile
              icon={<FontAwesomeIcon icon={faHourglassHalf} className="h-5 w-5" />}
              value={summary?.in_progress ?? 0}
              label="In Progress"
              caption="Started, not submitted"
              iconBg="bg-amber-50"
              iconColor="text-amber-600"
            />
            <StatTile
              icon={<FontAwesomeIcon icon={faCircleMinus} className="h-5 w-5" />}
              value={summary?.not_started ?? 0}
              label="Not Started"
              caption="No attempt yet"
              iconBg="bg-gray-100"
              iconColor="text-gray-600"
            />
            <StatTile
              icon={<FontAwesomeIcon icon={faChartSimple} className="h-5 w-5" />}
              value={summary?.average_score === null ? "—" : `${summary?.average_score ?? 0}%`}
              label="Average Score"
              caption="Best attempt per student"
              iconBg="bg-brand-600/10"
              iconColor="text-brand-600"
            />
          </div>

          <div className="mb-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <div className="relative flex-1">
              <FontAwesomeIcon
                icon={faSearch}
                className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-surface py-2.5 pl-11 pr-4 text-gray-700 transition-all placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/40"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as Status | "all")}
              className="cursor-pointer rounded-xl border border-gray-200 bg-surface px-4 py-2.5 text-gray-700 transition-all focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/40"
            >
              <option value="all">All students</option>
              <option value="submitted">Completed</option>
              <option value="in_progress">In progress</option>
              <option value="not_started">Not started</option>
            </select>
          </div>

          {loading ? (
            <SkeletonTable cols={7} />
          ) : (
            <div className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="border-b border-gray-100 bg-subtle">
                    <tr>
                      {["Student", "Section", "Status", "Best Score", "Attempts", "Submitted", "Time"].map(
                        (h) => (
                          <th
                            key={h}
                            className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:px-6"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {filtered.map((r) => (
                      <tr
                        key={r.student_id}
                        onClick={() => router.push(`/faculty/students/${r.student_id}`)}
                        className="cursor-pointer transition-colors hover:bg-subtle"
                      >
                        <td className="px-4 py-4 sm:px-6">
                          <div className="flex items-center gap-3">
                            <Avatar name={r.name} src={r.picture_url} size="md" />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-gray-800">{r.name}</p>
                              <p className="truncate text-sm text-gray-500">{r.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600 sm:px-6">
                          {r.section ?? "Unassigned"}
                        </td>
                        <td className="px-4 py-4 sm:px-6">
                          <span
                            className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold ${STATUS_BADGE[r.status]}`}
                          >
                            {STATUS_LABEL[r.status]}
                          </span>
                        </td>
                        <td className="px-4 py-4 sm:px-6">
                          {r.best_score === null ? (
                            <span className="text-sm text-gray-400">—</span>
                          ) : (
                            <span
                              className={`text-sm font-semibold ${
                                r.best_score >= 70 ? "text-brand-600" : "text-rose-600"
                              }`}
                            >
                              {formatScore(r.best_score)}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600 sm:px-6">
                          {r.attempt_count === 0 ? "—" : r.attempt_count}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500 sm:px-6">
                          {formatDateTime(r.latest_submitted_at)}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-500 sm:px-6">
                          {formatDuration(r.latest_time_taken_seconds)}
                        </td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-12 text-center text-gray-400">
                          {results.length === 0
                            ? "No students are targeted by this assessment yet"
                            : "No students match this filter"}
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
