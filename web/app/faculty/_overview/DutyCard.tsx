import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCalendarDay } from "@fortawesome/free-solid-svg-icons";
import type { FacultyOverview } from "../../lib/api";
import { clockTime, plural } from "./format";

type Shift = FacultyOverview["upcoming_shifts"][number];

const SHOWN = 3;
const SHIFT_NAMES: Record<string, string> = { am: "AM", pm: "PM", night: "Night" };

/**
 * The next few ward shifts across the faculty member's sections, each as a
 * calendar leaf. A shift already under way is drawn live, with its check-ins.
 * `now` is when the page loaded, so "live" agrees with every other figure on it.
 */
export default function DutyCard({ shifts, now }: { shifts: Shift[]; now: number }) {
  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
      <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Next on duty</h2>
        <Link href="/faculty/attendance" className="text-[13px] font-medium text-brand-600 hover:text-brand-700">
          Roster →
        </Link>
      </header>

      {shifts.length === 0 ? (
        <div className="flex items-center gap-3 px-4 py-6">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-400">
            <FontAwesomeIcon icon={faCalendarDay} className="h-4 w-4" />
          </span>
          <p className="text-sm text-slate-500">No ward shifts scheduled for your sections.</p>
        </div>
      ) : (
        <ul className="divide-y divide-hairline">
          {shifts.slice(0, SHOWN).map((shift) => {
            const start = new Date(shift.starts_at);
            const live = Date.parse(shift.starts_at) <= now && now < Date.parse(shift.ends_at);
            return (
              <li key={shift.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`flex w-12 shrink-0 flex-col items-center rounded-lg border py-1.5 ${
                    live ? "border-brand-600 bg-brand-600 text-white" : "border-hairline bg-subtle text-slate-900"
                  }`}
                >
                  <span className={`font-mono text-[9px] uppercase tracking-[0.14em] ${live ? "text-white/80" : "text-slate-500"}`}>
                    {start.toLocaleDateString(undefined, { weekday: "short" })}
                  </span>
                  <span className="font-display text-[19px] font-semibold leading-tight">{start.getDate()}</span>
                  <span className={`font-mono text-[9px] uppercase tracking-[0.14em] ${live ? "text-white/80" : "text-slate-500"}`}>
                    {start.toLocaleDateString(undefined, { month: "short" })}
                  </span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-slate-900">
                      {shift.label || "Ward shift"}
                    </span>
                    <span className="shrink-0 rounded bg-brand-600/10 px-1.5 py-0.5 font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-brand-700">
                      {SHIFT_NAMES[shift.shift_type] ?? "Shift"}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12.5px] text-slate-500">
                    {live && (
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />
                        <span className="relative h-2 w-2 rounded-full bg-emerald-500" />
                      </span>
                    )}
                    <span className="truncate">
                      {clockTime(shift.starts_at)} – {clockTime(shift.ends_at)}
                      {live ? ` · ${shift.checked_in}/${shift.rostered} checked in` : ` · ${plural(shift.rostered, "nurse")}`}
                    </span>
                  </span>
                  <span className="mt-0.5 block truncate text-[12px] text-slate-400">
                    {[shift.section, shift.room].filter(Boolean).join(" · ")}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
