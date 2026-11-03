import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faClipboardCheck, faFlask, faHandHoldingMedical, faListCheck } from "@fortawesome/free-solid-svg-icons";
import { CardLabel } from "../../components/Card";
import type { FacultyOverview } from "../../lib/api";
import { dueIn, performsIn, plural, timeAgo } from "./format";
import SlackNote from "./SlackNote";

type DueItem = FacultyOverview["due_soon"][number];

/**
 * What is waiting on the faculty member: scenario submissions to finalize,
 * longest-waiting first, and the work falling due in the week ahead. Leave out
 * `dueSoon` when ComingUpCard shows it instead.
 *
 * Fills the height it is given. With every submission listed, a closing note
 * takes up the spare height. With some held back as "and N more" that note
 * wouldn't be true, so the sections grow by the rows they hold and the rows
 * spread out, staying the same height in both.
 */
export default function WaitingCard({
  review,
  dueSoon,
}: {
  review: FacultyOverview["review_queue"];
  dueSoon?: DueItem[];
}) {
  const listedAll = review.total === review.items.length;
  const grow = (rows: number) => ({ flexGrow: listedAll ? 0 : Math.max(1, rows) });

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
      <header className="flex items-center justify-between border-b border-hairline px-4 py-3">
        <h2 className="font-display text-[15px] font-semibold tracking-[-0.01em] text-slate-900">Waiting on you</h2>
        <Link href="/instructor/scenarios/review" className="text-[13px] font-medium text-brand-600 hover:text-brand-700">
          Review queue →
        </Link>
      </header>

      <div className="flex flex-col px-4 pb-3 pt-3" style={grow(review.items.length)}>
        <CardLabel>Patient case reviews</CardLabel>
        {review.total === 0 ? (
          <p className="mt-2 flex flex-1 items-center gap-2 text-[13px] text-slate-500">
            <FontAwesomeIcon icon={faCircleCheck} className="h-3.5 w-3.5 text-emerald-500" />
            Queue is clear — nothing to finalize.
          </p>
        ) : (
          <ul className="mt-2 flex flex-1 flex-col gap-2">
            {review.items.map((item) => (
              <li key={item.assignment_id} className="flex flex-1 flex-col justify-center">
                <Link
                  href="/instructor/scenarios/review"
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

      {dueSoon && (
        <div className="flex flex-col border-t border-hairline px-4 pb-3.5 pt-3" style={grow(dueSoon.length)}>
          <CardLabel>Coming up this week</CardLabel>
          {dueSoon.length === 0 ? (
            <p className="mt-2 flex flex-1 items-center text-[13px] text-slate-500">Nothing coming up in the next 7 days.</p>
          ) : (
            <ul className="mt-2 flex flex-1 flex-col gap-2">
              {dueSoon.map((item) => (
                <li key={`${item.kind}-${item.id}`} className="flex flex-1 items-center">
                  <DueRow item={item} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {listedAll && (
        <div className="min-h-0 flex-1 [container-type:size]">
          <SlackNote
            title="That's everything for now"
            detail="New submissions and deadlines will show up here."
            className="hidden border-t border-hairline px-4 fits-line:flex"
          />
        </div>
      )}
    </section>
  );
}

/**
 * "Coming up" as its own strip across the page, for when the attention list is
 * too short to sit beside it. The items grow to fill each line they wrap onto.
 */
export function ComingUpCard({ items }: { items: DueItem[] }) {
  return (
    <section className="rounded-xl border border-hairline bg-surface px-4 pb-3.5 pt-3 shadow-tile">
      <CardLabel>Coming up this week</CardLabel>
      <ul className="mt-2 flex flex-wrap gap-x-6 gap-y-2.5">
        {items.map((item) => (
          <li key={`${item.kind}-${item.id}`} className="flex min-w-0 flex-[1_1_260px]">
            <DueRow item={item} align="items-start" />
          </li>
        ))}
      </ul>
    </section>
  );
}

function DueRow({ item, align = "items-center" }: { item: DueItem; align?: string }) {
  return (
    <span className={`flex min-w-0 flex-1 gap-2.5 ${align}`}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500">
        <FontAwesomeIcon
          icon={item.kind === "scenario" ? faFlask : item.kind === "return_demo" ? faHandHoldingMedical : faListCheck}
          className="h-3.5 w-3.5"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 text-[13px] font-medium text-slate-900">{item.title}</span>
        <span className="block text-pretty text-[12px] text-slate-500">
          {/* Quizzes are due; patient cases and Return Demonstrations are performed on their date. */}
          {item.kind === "scenario" || item.kind === "return_demo"
            ? `${performsIn(item.deadline)} · ${plural(item.open, "student")} not graded yet`
            : `${dueIn(item.deadline)} · ${plural(item.open, "student")} yet to hand in`}
        </span>
      </span>
    </span>
  );
}
