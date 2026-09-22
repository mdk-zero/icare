import type { AnalyticsSummary } from "../../lib/api";
import Avatar from "../../components/Avatar";

/** Ranked list of top scorers — a leaderboard, not a plain table, so rank
 * and magnitude are both legible at a glance (medal badge + a proportional
 * fill bar behind each row). */
export function Leaderboard({ students }: { students: AnalyticsSummary["top_students"] }) {
  if (students.length === 0) {
    return (
      <p className="text-gray-400 text-sm py-12 text-center">
        No submitted attempts in range yet — scores will rank here once students start.
      </p>
    );
  }
  const max = Math.max(...students.map((s) => s.average_score), 1);
  const rankStyle = (rank: number) => {
    if (rank === 1) return "bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-sm";
    if (rank === 2) return "bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm";
    if (rank === 3) return "bg-gradient-to-br from-orange-300 to-orange-500 text-white shadow-sm";
    return "bg-gray-100 text-gray-500";
  };
  return (
    <div className="space-y-2">
      {students.map((s, i) => {
        const rank = i + 1;
        return (
          <div
            key={s.student_key}
            className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-hairline bg-surface p-3"
          >
            <div
              className="absolute inset-y-0 left-0 bg-brand-600/[0.06] transition-all duration-700 ease-out"
              style={{ width: `${(s.average_score / max) * 100}%` }}
              aria-hidden
            />
            <span
              className={`relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${rankStyle(rank)}`}
            >
              {rank}
            </span>
            <Avatar
              name={s.name}
              src={s.picture_url}
              userId={s.student_key}
              sex={s.sex}
              size="sm"
              tone="brand"
              className="relative z-10"
            />
            <div className="relative z-10 min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-gray-900">{s.name}</p>
              <p className="truncate text-xs text-gray-400">
                {s.section ?? "No section"} · {s.attempts} attempt{s.attempts === 1 ? "" : "s"}
              </p>
            </div>
            <span className="relative z-10 shrink-0 text-sm font-bold text-brand-700 tabular-nums">
              {s.average_score}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Mirrors a Leaderboard row: rank badge, avatar, name + meta, score. */
export function LeaderboardSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="space-y-2 animate-pulse">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-xl border border-hairline bg-surface p-3">
          <span className="h-7 w-7 shrink-0 rounded-full bg-gray-100" />
          <span className="h-8 w-8 shrink-0 rounded-full bg-gray-100" />
          <span className="min-w-0 flex-1 space-y-1.5">
            <span className="block h-3.5 w-40 max-w-full rounded bg-gray-100" />
            <span className="block h-3 w-28 max-w-full rounded bg-gray-100" />
          </span>
          <span className="h-4 w-10 shrink-0 rounded bg-gray-100" />
        </div>
      ))}
    </div>
  );
}
