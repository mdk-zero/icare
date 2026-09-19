"use client";

import { apiFetch } from "../api";
import type { RecentReport } from "./types";

export type ReportFormat = "pdf" | "csv";

export type FetchedReport = { blob: Blob; filename: string } | { error: string };

/**
 * Builds one report. `endpoint` is the role's report route
 * (`/api/faculty/reports` or `/api/admin/reports`); a null `id` asks for the
 * whole-scope version (roster, admin summary, every faculty member).
 *
 * The body is a PDF or CSV, which `apiFetch` never caches (only JSON is
 * replayable), so every call really does rebuild the report from live records.
 */
export async function fetchReport(
  endpoint: string,
  type: string,
  id: string | null,
  format: ReportFormat,
): Promise<FetchedReport> {
  try {
    const query = new URLSearchParams({ format });
    if (id) query.set("id", id);
    const res = await apiFetch(`${endpoint}/${type}?${query}`, { credentials: "include" });

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      return { error: json.error || "Unable to generate this report" };
    }

    // Prefer the filename the server chose, so PDF/CSV naming stays consistent.
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    return { blob: await res.blob(), filename: match?.[1] ?? `icare-${type}-report.${format}` };
  } catch {
    return { error: "Unable to generate this report" };
  }
}

/** Hands a blob to the browser as a download. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** The caller's own recent reports, newest first — see /api/reports/recent. */
export async function fetchRecentReports(): Promise<RecentReport[]> {
  try {
    const res = await apiFetch("/api/reports/recent", { credentials: "include" });
    if (!res.ok) return [];
    const json = (await res.json()) as { reports?: RecentReport[] };
    return json.reports ?? [];
  } catch {
    return [];
  }
}
