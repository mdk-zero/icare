import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBell,
  faHandHoldingMedical,
  faHeartPulse,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import type { FacultyAlert } from "../../lib/api";
import { timeAgo } from "./format";

const SHOWN = 6;

const TYPE_META: Record<string, { icon: IconDefinition; short: string; one: string; many: string }> = {
  "Assistance Request": { icon: faHandHoldingMedical, short: "Help", one: "help request", many: "help requests" },
  "Vitals Anomaly": { icon: faHeartPulse, short: "Vitals", one: "abnormal reading", many: "abnormal readings" },
};

/** At-risk predictions are the attention list's to show; repeating them here crowded out the rest. */
const SHOWN_TYPES = new Set(Object.keys(TYPE_META));
const SEVERITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

const SEVERITY: Record<string, { dot: string; text: string }> = {
  high: { dot: "bg-red-500", text: "High" },
  medium: { dot: "bg-amber-500", text: "Medium" },
  low: { dot: "bg-emerald-500", text: "Low" },
};

/**
 * Open clinical alerts — help requests and abnormal vitals charted by students
 * — as a feed rather than a six-column table: the reader wants who, what and
 * how bad, and the columns spent most of the width on status labels that were
 * almost always "Pending". Help requests and the most severe readings lead.
 */
export default function AlertFeed({ alerts }: { alerts: FacultyAlert[] }) {
  const open = alerts
    .filter((a) => a.status !== "resolved" && SHOWN_TYPES.has(a.alert_type))
    .sort(
      (a, b) =>
        Number(b.alert_type === "Assistance Request") - Number(a.alert_type === "Assistance Request") ||
        (SEVERITY_RANK[a.severity] ?? 3) - (SEVERITY_RANK[b.severity] ?? 3) ||
        b.created_at.localeCompare(a.created_at),
    );
  const counts = open.reduce<Record<string, number>>((acc, a) => {
    acc[a.alert_type] = (acc[a.alert_type] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
      <header className="border-b border-hairline px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-slate-900">Clinical alerts</h2>
          {open.length > 0 && (
            <span className="rounded-full bg-red-50 px-2.5 py-0.5 text-[12px] font-semibold text-red-600">
              {open.length} open
            </span>
          )}
        </div>
        {open.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(counts).map(([type, n]) => (
              <span
                key={type}
                className="inline-flex items-center gap-1.5 rounded-md bg-subtle px-2 py-0.5 text-[11.5px] text-slate-600"
              >
                <FontAwesomeIcon icon={TYPE_META[type]?.icon ?? faBell} className="h-2.5 w-2.5 text-slate-400" />
                <span className="font-semibold text-slate-900">{n}</span>
                {n === 1 ? TYPE_META[type]?.one : TYPE_META[type]?.many}
              </span>
            ))}
          </div>
        )}
      </header>

      {open.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 py-10 text-center">
          <p className="font-medium text-slate-900">No open clinical alerts</p>
          <p className="mt-1 text-sm text-slate-500">No help requests or abnormal vitals from your students.</p>
        </div>
      ) : (
        <ul className="flex-1 divide-y divide-hairline">
          {open.slice(0, SHOWN).map((alert) => {
            const meta = TYPE_META[alert.alert_type];
            const severity = SEVERITY[alert.severity] ?? SEVERITY.low;
            return (
              <li key={alert.id}>
                <Link
                  href={`/faculty/students/${alert.student_id}`}
                  className="flex gap-3 px-4 py-3 transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-subtle text-slate-500">
                    <FontAwesomeIcon icon={meta?.icon ?? faBell} className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-[13.5px] font-medium text-slate-900">{alert.student_name}</span>
                      <span className="flex shrink-0 items-center gap-1 font-mono text-[9.5px] uppercase tracking-[0.12em] text-slate-500">
                        <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${severity.dot}`} />
                        {severity.text} · {meta?.short ?? alert.alert_type}
                      </span>
                    </span>
                    <span className="mt-0.5 line-clamp-1 text-[12.5px] text-slate-500">{alert.description}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-400">
                    {timeAgo(alert.created_at)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
