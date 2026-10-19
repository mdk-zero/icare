"use client";

import { apiFetch } from "../api";
import type { RecentReport } from "./types";

export type FetchedReport = { blob: Blob; filename: string } | { error: string };

/**
 * Builds one report as a PDF. `endpoint` is the role's report route
 * (`/api/faculty/reports` or `/api/admin/reports`); a null `id` asks for the
 * whole-scope version (roster, admin summary, every faculty member).
 *
 * The PDF comes back base64-encoded inside JSON, not as a PDF body: download
 * managers such as IDM seize any PDF response and abort this request, which
 * broke previews. `no-store` keeps it out of the response cache, so every call
 * really does rebuild the report from live records.
 */
export async function fetchReport(
  endpoint: string,
  type: string,
  id: string | null,
): Promise<FetchedReport> {
  try {
    const query = id ? `?${new URLSearchParams({ id })}` : "";
    const res = await apiFetch(`${endpoint}/${type}${query}`, {
      credentials: "include",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      return { error: json.error || "Unable to generate this report" };
    }

    if (res.headers.get("content-type")?.includes("application/json")) {
      const { filename, pdf } = (await res.json()) as { filename: string; pdf: string };
      const bytes = Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
      return { blob: new Blob([bytes], { type: "application/pdf" }), filename };
    }

    // Demo mode answers in the browser with the PDF itself; no download manager
    // sees that. Prefer the filename the server chose, so naming stays consistent.
    const disposition = res.headers.get("Content-Disposition") ?? "";
    const match = disposition.match(/filename="([^"]+)"/);
    return { blob: await res.blob(), filename: match?.[1] ?? `icare-${type}-report.pdf` };
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
