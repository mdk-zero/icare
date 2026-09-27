"use client";

import type { CaseSubmissionStatus } from "../../lib/api";

export const inputClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm shadow-sm";
export const labelClassName = "block text-sm font-bold text-gray-800 mb-2";

const STATUS: Record<CaseSubmissionStatus, { label: string; className: string }> = {
  not_started: { label: "Not started", className: "bg-gray-100 text-gray-600" },
  draft: { label: "Draft", className: "bg-amber-100 text-amber-700" },
  submitted: { label: "Submitted", className: "bg-blue-100 text-blue-700" },
  graded: { label: "Graded", className: "bg-emerald-100 text-emerald-700" },
};

export function CaseStatusBadge({ status, late }: { status: CaseSubmissionStatus; late?: boolean }) {
  const s = STATUS[status];
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`px-2 py-0.5 text-xs rounded-full ${s.className}`}>{s.label}</span>
      {late && <span className="px-2 py-0.5 text-xs rounded-full bg-rose-100 text-rose-700">Late</span>}
    </span>
  );
}

export const formatDue = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })
    : "No due date";

/** ISO → the value a datetime-local input wants, in local time. */
export function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local value → ISO, or null when empty. */
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);
