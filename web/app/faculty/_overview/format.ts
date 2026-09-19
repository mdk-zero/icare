/**
 * Wording for the faculty overview. Everything here runs in the browser, so
 * dates read in the faculty member's own timezone.
 */

const DAY_MS = 86_400_000;

/** "3h ago" for anything recent, an absolute date once it stops being useful. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "No activity yet";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** Whole days since a moment, or null when it never happened. */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const then = new Date(iso).getTime();
  return Number.isNaN(then) ? null : Math.floor((Date.now() - then) / DAY_MS);
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Calendar days from today to `iso`: 0 today, 1 tomorrow, -1 yesterday. */
function dayOffset(iso: string): number {
  return Math.round((startOfDay(new Date(iso).getTime()) - startOfDay(Date.now())) / DAY_MS);
}

/** "Today", "Tomorrow", "Wednesday", or "Mon, Sep 28" once it is over a week out. */
export function relativeDay(iso: string): string {
  const offset = dayOffset(iso);
  if (offset === 0) return "Today";
  if (offset === 1) return "Tomorrow";
  if (offset > 1 && offset < 7) return new Date(iso).toLocaleDateString(undefined, { weekday: "long" });
  return new Date(iso).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** "due today", "due tomorrow", "due in 3 days". */
export function dueIn(iso: string): string {
  const offset = dayOffset(iso);
  if (offset <= 0) return "due today";
  if (offset === 1) return "due tomorrow";
  return `due in ${offset} days`;
}

export function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "a, b, and c" — the list the masthead's summary sentence is built from. */
export function listSentence(parts: string[]): string {
  return new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(parts);
}

/**
 * Audit trail entries are stored as dotted codes ("patient.check_in") with a
 * details object. Known ones get a sentence; the rest are made readable from
 * the code itself, so a new action still shows up rather than vanishing.
 */
const PHRASES: Record<string, string> = {
  "patient.check_in": "Checked a patient in",
  "patient.check_out": "Checked a patient out",
  "patient.discharge": "Discharged a patient",
  "patient.transfer": "Moved a patient",
  "report.generate": "Generated a report",
  "assessment.create": "Created a quiz",
  "assessment.update": "Edited a quiz",
  "assessment.delete": "Deleted a quiz",
  "assessment.publish": "Published a quiz",
  "scenario.create": "Created a scenario",
  "scenario.update": "Edited a scenario",
  "scenario.delete": "Deleted a scenario",
  "scenario.assign": "Assigned a scenario",
  generate_student_summary: "Generated an AI student summary",
  "warehouse.etl_run": "Refreshed the analytics warehouse",
};

export function describeActivity(
  action: string,
  metadata: Record<string, unknown> | null | undefined,
  fallbackDetail: string,
): { title: string; detail: string } {
  const known = PHRASES[action];
  const title =
    known ??
    action
      .replace(/[._]+/g, " ")
      .trim()
      .replace(/^./, (c) => c.toUpperCase());

  const m = metadata ?? {};
  const str = (key: string) => (typeof m[key] === "string" ? (m[key] as string) : null);
  let detail: string | null = null;
  if (str("name") && (str("to_room") || str("from_room"))) {
    detail = str("to_room") ? `${str("name")} → Room ${str("to_room")}` : `${str("name")} from Room ${str("from_room")}`;
  } else if (str("report")) {
    detail = [str("report"), str("subject"), str("format")?.toUpperCase()].filter(Boolean).join(" · ");
  } else if (str("title")) {
    detail = str("title");
  } else if (str("message") && !known) {
    detail = str("message");
  }
  return { title, detail: detail ?? (known ? "" : fallbackDetail) };
}
