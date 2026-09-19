import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faClipboardCheck, faFlask, faListCheck } from "@fortawesome/free-solid-svg-icons";
import { CardLabel } from "../../components/Card";
import type { FacultyOverview } from "../../lib/api";
import { dueIn, plural, timeAgo } from "./format";

/**
 * What is waiting on the faculty member: scenario submissions to finalize,
 * longest-waiting first, and the work falling due in the week ahead.
 */
export default function WaitingCard({
  review,
  dueSoon,
}: {
  review: FacultyOverview["review_queue"];
  dueSoon: FacultyOverview["due_soon"];
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
      <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Waiting on you</h2>
        <Link href="/faculty/scenarios/review" className="text-[13px] font-medium text-brand-600 hover:text-brand-700">
          Review queue →
        </Link>
      </header>

      <div className="px-4 pb-3 pt-3">
        <CardLabel>Scenario reviews</CardLabel>
        {review.total === 0 ? (
          <p className="mt-2 flex items-center gap-2 text-[13px] text-slate-500">
            <FontAwesomeIcon icon={faCircleCheck} className="h-3.5 w-3.5 text-emerald-500" />
            Queue is clear — nothing to finalize.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {review.items.map((item) => (
              <li key={item.assignment_id}>
                <Link
                  href="/faculty/scenarios/review"
                  className="group flex items-center gap-2.5 rounded-lg px-1 py-1 -mx-1 hover:bg-subtle"
                >
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-brand-600/10 text-brand-600">
                    <FontAwesomeIcon icon={faClipboardCheck} className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-slate-900">{item.student_name}</span>
                    <span className="block truncate text-[12px] text-slate-500">{item.scenario_title}</span>
                  </span>
                  <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.1em] text-slate-400">
                    {timeAgo(item.submitted_at)}
                  </span>
                </Link>
              </li>
            ))}
            {review.total > review.items.length && (
              <li className="text-[12px] text-slate-500">
                and {plural(review.total - review.items.length, "more submission")}
              </li>
            )}
          </ul>
        )}
      </div>

      <div className="border-t border-hairline px-4 pb-3.5 pt-3">
        <CardLabel>Due this week</CardLabel>
        {dueSoon.length === 0 ? (
          <p className="mt-2 text-[13px] text-slate-500">Nothing falls due in the next 7 days.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {dueSoon.map((item) => (
              <li key={`${item.kind}-${item.id}`} className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
                  <FontAwesomeIcon icon={item.kind === "scenario" ? faFlask : faListCheck} className="h-3.5 w-3.5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-slate-900">{item.title}</span>
                  <span className="block text-[12px] text-slate-500">
                    {dueIn(item.deadline)} · {plural(item.open, "student")} yet to hand in
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
