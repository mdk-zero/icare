/**
 * Client-side mirrors of the catalog shapes. Declared here rather than
 * imported from lib/dev/catalog because that module reaches for the
 * service-role Supabase client, which must never enter the browser bundle.
 */

export interface DevTable {
  schema_name: string;
  table_name: string;
  kind: "table" | "view" | "materialized view";
  row_estimate: number;
  total_bytes: number;
  has_primary_key: boolean;
}

export interface DevColumn {
  column_name: string;
  ordinal: number;
  data_type: string;
  udt_name: string;
  is_nullable: boolean;
  default_expr: string | null;
  is_identity: boolean;
  is_generated: boolean;
  is_primary_key: boolean;
  enum_values: string[] | null;
  check_clause: string | null;
  references_table: string | null;
  references_column: string | null;
  /** Legal values from an enum type or an enumerating check constraint. */
  options: string[] | null;
}

export interface DevRelation {
  constraint_name: string;
  child_schema: string;
  child_table: string;
  child_column: string;
  parent_column: string;
  delete_rule: string;
}

export type Row = Record<string, unknown>;

export interface TablePage {
  relation: DevTable;
  columns: DevColumn[];
  rows: Row[];
  total: number | null;
  limit: number;
  offset: number;
  writable: boolean;
}

export interface DevUser {
  id: string;
  email: string;
  name: string;
  role: "student" | "faculty" | "admin" | "super_admin";
  sex: "male" | "female" | null;
  picture_url: string | null;
  section_id: string | null;
  section_name: string | null;
  /** The admin a faculty account belongs to (migration 053); undefined before it. */
  admin_id?: string | null;
  google_sub: string | null;
  has_password: boolean;
  force_password_change: boolean;
  created_at: string;
  last_login_at: string | null;
}

export interface UserReference extends DevRelation {
  count: number | null;
  error?: string;
}

/**
 * Bypasses the app's cached fetch wrapper on purpose. A console that shows a
 * cached copy of a row you just changed elsewhere is worse than no console.
 */
export async function devFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: init?.body ? { "Content-Type": "application/json", ...init?.headers } : init?.headers,
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Request failed (${res.status})`);
  return json;
}

const NUMERIC = new Set(["int2", "int4", "int8", "float4", "float8", "numeric", "money"]);

/** How a value should be shown in a grid cell — compact, never wrapped. */
export function displayValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** How a value should be shown in an editable field — round-trippable. */
export function editValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value, null, 2);
  return String(value);
}

export function isNumericColumn(column: DevColumn): boolean {
  return NUMERIC.has(column.udt_name);
}

export function isMultilineColumn(column: DevColumn): boolean {
  return (
    column.udt_name === "json" ||
    column.udt_name === "jsonb" ||
    column.udt_name === "text" ||
    column.udt_name.startsWith("_")
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
}
