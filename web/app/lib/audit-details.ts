/** Keys every audit surface hides from the rendered details text. */
const HIDDEN_KEYS = new Set(["migrated_from", "actor_name", "target_id"]);

function formatPrimitive(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        v !== null && typeof v === "object" ? JSON.stringify(v) : String(v),
      )
      .join(", ");
  }
  if (value !== null && typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Turns an audit log's `details` JSON into the one-line summary shown in
 * every audit trail's Details column.
 *
 * A hand-written `message` wins outright. Otherwise every field is rendered
 * as `key: value` — including one level of nesting, so a partial-update
 * payload logged as `{ updates: { title, category, ... } }` reads as
 * `title: ..., category: ...` instead of a raw, easily-truncated JSON blob.
 */
export function formatAuditDetails(
  details: Record<string, unknown> | null | undefined,
): string {
  if (!details) return "";
  if (typeof details.message === "string") return details.message;

  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (HIDDEN_KEYS.has(key) || value == null) continue;
    if (!Array.isArray(value) && typeof value === "object") {
      for (const [nestedKey, nestedValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (nestedValue == null) continue;
        parts.push(`${nestedKey}: ${formatPrimitive(nestedValue)}`);
      }
      continue;
    }
    parts.push(`${key}: ${formatPrimitive(value)}`);
  }
  return parts.join(", ");
}
