/* Date helpers shared by the analytics page, its trend chart and its leaderboard. */

import type { AnalyticsBucket } from "../../lib/api";

/** Parsed as local midnight, so a bucket start never renders as the day before. */
export function parseDay(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

export function formatRange(from: string, to: string): string {
  const a = parseDay(from);
  const b = parseDay(to);
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = a.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const right = b.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${left} – ${right}`;
}

/**
 * The range a course is read over: as far as the picked range reaches into its
 * term, since nothing outside the term counts toward it. A range missing the
 * term altogether stays as picked, so the empty panels name what was asked for.
 */
export function courseRange(
  wholeTerm: boolean,
  range: { from: string; to: string },
  term: { starts_on: string; ends_on: string } | undefined,
): { from: string; to: string } {
  if (!term) return range;
  if (wholeTerm) return { from: term.starts_on, to: term.ends_on };
  const from = range.from > term.starts_on ? range.from : term.starts_on;
  const to = range.to < term.ends_on ? range.to : term.ends_on;
  return from <= to ? { from, to } : range;
}

/** X-axis tick text, tightened as the buckets get coarser. */
export function formatBucket(value: string, bucket: AnalyticsBucket): string {
  const d = parseDay(value);
  if (bucket === "year") return `${d.getFullYear()}`;
  if (bucket === "month")
    return d.toLocaleDateString(undefined, { month: "short", year: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
