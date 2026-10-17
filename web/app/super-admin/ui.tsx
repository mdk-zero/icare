import type { RunTone } from "./run-status";

export const CARD =
  "bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]";

export const TONE_STYLE: Record<RunTone, { dot: string; text: string }> = {
  good: { dot: "bg-emerald-500", text: "text-emerald-700" },
  warn: { dot: "bg-amber-500", text: "text-amber-700" },
  bad: { dot: "bg-rose-500", text: "text-rose-700" },
  idle: { dot: "bg-gray-300", text: "text-gray-500" },
};

/** A verdict in words beside a coloured dot: the colour is never the only signal. */
export function StatusText({ tone, children, className = "" }: { tone: RunTone; children: React.ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 ${TONE_STYLE[tone].text} ${className}`}>
      <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE_STYLE[tone].dot}`} />
      {children}
    </span>
  );
}

/** Shown wherever the portal reads a table or RPC that migration 054 adds. */
export function MigrationPending() {
  return (
    <div className={`${CARD} p-6 text-sm text-gray-600`}>
      <p className="font-semibold text-gray-800 mb-1">Migration 054 isn&apos;t applied yet</p>
      Apply <code className="font-mono text-xs">web/supabase/migrations/054_super_admin.sql</code> in the Supabase SQL
      editor to start recording request telemetry and test runs.
    </div>
  );
}
