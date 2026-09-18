/* Date helpers shared by the analytics page and its leaderboard. */

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
