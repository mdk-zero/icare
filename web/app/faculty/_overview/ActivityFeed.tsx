import type { AuditLog } from "../../lib/api";
import { describeActivity, timeAgo } from "./format";

const SHOWN = 6;

/** The faculty member's own recent actions, phrased as sentences rather than log codes. */
export default function ActivityFeed({ activities }: { activities: AuditLog[] }) {
  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
      <header className="border-b border-hairline px-4 py-3.5">
        <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-slate-900">Your recent activity</h2>
      </header>
      {activities.length === 0 ? (
        <p className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-slate-500">
          Nothing recorded yet.
        </p>
      ) : (
        <ol className="relative px-4 py-3 before:absolute before:bottom-5 before:left-[23px] before:top-5 before:w-px before:bg-hairline">
          {activities.slice(0, SHOWN).map((activity) => {
            const { title, detail } = describeActivity(activity.action, activity.metadata, activity.details);
            return (
              <li key={activity.id} className="relative flex gap-3 py-2">
                <span className="relative z-10 mt-1.5 flex h-2.5 w-2.5 shrink-0 translate-x-[3px] rounded-full border-2 border-surface bg-brand-500 ring-1 ring-brand-200" />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13.5px] font-medium text-slate-900">{title}</span>
                    <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-400">
                      {timeAgo(activity.created_at)}
                    </span>
                  </span>
                  {detail && <span className="block truncate text-[12.5px] text-slate-500">{detail}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
