export const CARD =
  "bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)]";

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
