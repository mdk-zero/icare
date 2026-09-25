import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronRight,
  faCircleCheck,
  faClock,
  faHandHoldingMedical,
  faHourglassHalf,
  faArrowTrendDown,
  faTriangleExclamation,
  type IconDefinition,
} from "@fortawesome/free-solid-svg-icons";
import Avatar from "../../components/Avatar";
import { CardLabel } from "../../components/Card";
import type { FacultyOverview } from "../../lib/api";
import { daysSince, plural } from "./format";

type Student = FacultyOverview["attention"][number];

/** Kept in step with the server's thresholds in lib/faculty-dashboard.ts. */
const LOW_AVERAGE = 60;
const QUIET_DAYS = 7;
const SHOWN = 6;

interface Reason {
  icon: IconDefinition;
  text: string;
  chip: string;
  /** The edge colour, for the reason that heads the row. */
  edge: string;
}

/** Why this student is on the list, most serious first. */
function reasons(s: Student): Reason[] {
  const out: Reason[] = [];
  if (s.open_assistance > 0) {
    out.push({
      icon: faHandHoldingMedical,
      text: s.open_assistance > 1 ? `${s.open_assistance} help requests` : "Asked for help",
      chip: "bg-red-50 text-red-700",
      edge: "bg-red-500",
    });
  }
  if (s.risk === "at_risk") {
    out.push({
      icon: faTriangleExclamation,
      text: s.probability != null ? `At risk · ${Math.round(s.probability * 100)}%` : "At risk",
      chip: "bg-red-50 text-red-700",
      edge: "bg-red-500",
    });
  }
  if (s.overdue > 0) {
    out.push({
      icon: faClock,
      text: `${s.overdue} overdue`,
      chip: "bg-amber-50 text-amber-700",
      edge: "bg-amber-500",
    });
  }
  if (s.recent_avg != null && s.recent_avg < LOW_AVERAGE) {
    out.push({
      icon: faArrowTrendDown,
      text: `Avg ${Math.round(s.recent_avg)}% · 2 wks`,
      chip: "bg-rose-50 text-rose-700",
      edge: "bg-rose-400",
    });
  }
  const quiet = daysSince(s.last_activity);
  if (quiet == null || quiet >= QUIET_DAYS) {
    out.push({
      icon: faHourglassHalf,
      text: quiet == null ? "No activity yet" : `Quiet ${quiet} days`,
      chip: "bg-slate-100 text-slate-600",
      edge: "bg-slate-300",
    });
  }
  return out;
}

/**
 * The students worth a look today, most urgent first — ranked on the server
 * from help requests, the risk model, overdue work, recent scores and
 * silence. Replaces a list of whichever five students sorted first by name.
 */
export default function AttentionList({
  students,
  total,
  roster,
}: {
  students: Student[];
  total: number;
  roster: number;
}) {
  const shown = students.slice(0, SHOWN);
  const more = total - shown.length;

  return (
    <section className="flex h-full flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile">
      <header className="flex items-start justify-between gap-4 border-b border-hairline px-4 py-3.5">
        <div>
          <h2 className="font-display text-[17px] font-semibold tracking-[-0.01em] text-slate-900">
            Needs your attention
          </h2>
          <p className="mt-0.5 text-[13px] text-slate-500">
            Ranked by help requests, risk, overdue work, recent scores and silence
          </p>
        </div>
        {roster > 0 && (
          <CardLabel className="mt-1 shrink-0">
            {total} of {roster}
          </CardLabel>
        )}
      </header>

      {shown.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-12 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <FontAwesomeIcon icon={faCircleCheck} className="h-5 w-5" />
          </span>
          <p className="font-medium text-slate-900">Everyone is on track</p>
          <p className="max-w-xs text-sm text-slate-500">
            No one is at risk, behind on work, or gone quiet.
          </p>
        </div>
      ) : (
        <ol className="flex-1 divide-y divide-hairline">
          {shown.map((student, i) => {
            const why = reasons(student);
            return (
              <li key={student.id}>
                <Link
                  href={`/faculty/students/${student.id}`}
                  className="group relative flex items-center gap-3 py-3 pl-5 pr-4 transition-colors hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none"
                >
                  <span
                    aria-hidden
                    className={`absolute inset-y-2.5 left-0 w-[3px] rounded-r-full ${why[0]?.edge ?? "bg-slate-200"}`}
                  />
                  <span className="w-4 shrink-0 text-right font-mono text-[11px] text-slate-400">{i + 1}</span>
                  <Avatar
                    name={student.name}
                    src={student.picture_url}
                    userId={student.id}
                    sex={student.sex}
                    size="sm"
                    tone="solid"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate font-medium text-slate-900">{student.name}</span>
                      {student.section && (
                        <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-400">
                          {student.section}
                        </span>
                      )}
                    </span>
                    <span className="mt-1.5 flex flex-wrap gap-1.5">
                      {why.map((r) => (
                        <span
                          key={r.text}
                          className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${r.chip}`}
                        >
                          <FontAwesomeIcon icon={r.icon} className="h-2.5 w-2.5" />
                          {r.text}
                        </span>
                      ))}
                    </span>
                  </span>
                  <FontAwesomeIcon
                    icon={faChevronRight}
                    className="h-3 w-3 shrink-0 text-slate-300 transition-transform duration-150 group-hover:translate-x-0.5 group-hover:text-brand-600"
                  />
                </Link>
              </li>
            );
          })}
          {roster - total > 0 && (
            <li className="flex items-center gap-2.5 px-5 py-3.5 text-[13px] text-slate-500">
              <FontAwesomeIcon icon={faCircleCheck} className="h-3.5 w-3.5 text-emerald-500" />
              {roster - total === 1 ? "The other student is on track." : `The other ${roster - total} students are on track.`}
            </li>
          )}
        </ol>
      )}

      <footer className="flex items-center justify-between border-t border-hairline px-4 py-2.5">
        <span className="text-[12px] text-slate-500">
          {more > 0 ? `${plural(more, "more student")} flagged` : " "}
        </span>
        <Link
          href="/faculty/teams"
          className="text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
        >
          My groups →
        </Link>
      </footer>
    </section>
  );
}
