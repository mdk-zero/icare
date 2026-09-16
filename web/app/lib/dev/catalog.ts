import { getSupabaseAdmin } from '../supabase/server';

/**
 * Catalog access for the developer console. Every table/column shape the
 * console renders comes from migration 033's introspection functions rather
 * than a checked-in list, so the console never drifts from the live database.
 */

export interface DevTable {
  schema_name: string;
  table_name: string;
  kind: 'table' | 'view' | 'materialized view';
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
}

export interface DevRelation {
  constraint_name: string;
  child_schema: string;
  child_table: string;
  child_column: string;
  parent_column: string;
  delete_rule: string;
}

/**
 * PostgREST only serves schemas listed as exposed in the project settings.
 * Anything else is readable through dev_select_rows and not writable at all,
 * which for `dw` is the right answer anyway — the ETL owns those rows.
 */
export const WRITABLE_SCHEMA = 'public';

export const MAX_PAGE_SIZE = 200;

export class DevError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * The table list is hit on every console navigation and changes only when a
 * migration runs, so it is held briefly in process memory. Short enough that
 * applying a migration and reloading shows the new table.
 */
let tableCache: { at: number; tables: DevTable[] } | null = null;
const TABLE_CACHE_MS = 15_000;

export async function listTables(force = false): Promise<DevTable[]> {
  if (!force && tableCache && Date.now() - tableCache.at < TABLE_CACHE_MS) {
    return tableCache.tables;
  }
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('dev_list_tables');
  if (error) {
    throw new DevError(
      `Catalog unavailable: ${error.message}. Has migration 033 been applied?`,
      500,
    );
  }
  const tables = (data ?? []) as DevTable[];
  tableCache = { at: Date.now(), tables };
  return tables;
}

export async function findTable(schema: string, table: string): Promise<DevTable> {
  const tables = await listTables();
  const match = tables.find(
    (entry) => entry.schema_name === schema && entry.table_name === table,
  );
  // 404 rather than 400: an unknown relation is indistinguishable from a
  // typo'd URL, and the console should not confirm what does not exist.
  if (!match) throw new DevError(`No such relation: ${schema}.${table}`, 404);
  return match;
}

export async function getColumns(schema: string, table: string): Promise<DevColumn[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('dev_table_columns', {
    p_schema: schema,
    p_table: table,
  });
  if (error) throw new DevError(`Unable to read columns: ${error.message}`, 500);
  return (data ?? []) as DevColumn[];
}

export async function getRelations(schema: string, table: string): Promise<DevRelation[]> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.rpc('dev_table_relations', {
    p_schema: schema,
    p_table: table,
  });
  if (error) throw new DevError(`Unable to read relations: ${error.message}`, 500);
  return (data ?? []) as DevRelation[];
}

/**
 * Pulls the literal values out of a single-column check constraint, so
 * `CHECK ((role = ANY (ARRAY['student'::text, 'faculty'::text])))` can drive a
 * dropdown. Anything it cannot read cleanly returns null and the column falls
 * back to a free-text input — a wrong guess here would block valid values.
 */
export function checkConstraintOptions(clause: string | null): string[] | null {
  if (!clause) return null;
  const literals = [...clause.matchAll(/'((?:[^']|'')*)'/g)].map((match) =>
    match[1].replace(/''/g, "'"),
  );
  if (literals.length < 2) return null;
  // A range check (`length(x) > 0`, `age between 1 and 120`) has no literals
  // to speak of; an enumeration is the only shape worth offering as options.
  if (!/=\s*ANY|IN\s*\(/i.test(clause)) return null;
  return [...new Set(literals)];
}

const NUMERIC_TYPES = new Set([
  'int2', 'int4', 'int8', 'float4', 'float8', 'numeric', 'money',
]);

const BOOLEAN_TYPES = new Set(['bool']);

const JSON_TYPES = new Set(['json', 'jsonb']);

/**
 * Turns a value from the editor into what PostgREST expects for that column.
 * Form fields arrive as strings whatever the column type is, and sending
 * `"42"` into an int column, or `""` into a nullable timestamp, is the
 * difference between a saved row and a 400 from Postgres.
 */
export function coerceValue(column: DevColumn, raw: unknown): unknown {
  if (raw === null || raw === undefined) return null;

  const { udt_name: udt } = column;
  const isArray = udt.startsWith('_');

  if (typeof raw !== 'string') {
    // Already a JSON number/boolean/object — the editor sends these for
    // columns whose control is native, and they need no reinterpretation.
    return raw;
  }

  const trimmed = raw.trim();
  if (trimmed === '') {
    if (column.is_nullable) return null;
    // A non-nullable text column can legitimately hold the empty string.
    if (NUMERIC_TYPES.has(udt) || BOOLEAN_TYPES.has(udt) || JSON_TYPES.has(udt) || isArray) {
      throw new DevError(`${column.column_name} cannot be empty`);
    }
    return '';
  }

  if (NUMERIC_TYPES.has(udt)) {
    const num = Number(trimmed);
    if (!Number.isFinite(num)) {
      throw new DevError(`${column.column_name} must be a number`);
    }
    return num;
  }

  if (BOOLEAN_TYPES.has(udt)) {
    if (['true', 't', '1', 'yes'].includes(trimmed.toLowerCase())) return true;
    if (['false', 'f', '0', 'no'].includes(trimmed.toLowerCase())) return false;
    throw new DevError(`${column.column_name} must be true or false`);
  }

  if (JSON_TYPES.has(udt) || isArray) {
    try {
      return JSON.parse(trimmed);
    } catch {
      throw new DevError(`${column.column_name} must be valid JSON`);
    }
  }

  return raw;
}

export interface RowFilter {
  column: string;
  op: string;
  value: string;
}

const FILTER_OPS = new Set([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is', 'in',
]);

export function parseFilters(raw: string | null, columns: DevColumn[]): RowFilter[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new DevError('filters must be valid JSON');
  }
  if (!Array.isArray(parsed)) throw new DevError('filters must be an array');

  const known = new Set(columns.map((column) => column.column_name));
  return parsed.map((entry) => {
    const { column, op, value } = (entry ?? {}) as Partial<RowFilter>;
    if (typeof column !== 'string' || !known.has(column)) {
      throw new DevError(`Unknown filter column: ${String(column)}`);
    }
    if (typeof op !== 'string' || !FILTER_OPS.has(op)) {
      throw new DevError(`Unsupported filter operator: ${String(op)}`);
    }
    return { column, op, value: typeof value === 'string' ? value : String(value ?? '') };
  });
}

/**
 * The columns that identify one row for update and delete. A table without a
 * primary key can still be browsed, but editing it would have to match on
 * every column and could silently hit more rows than intended.
 */
export function primaryKeyColumns(columns: DevColumn[]): DevColumn[] {
  return columns.filter((column) => column.is_primary_key);
}
