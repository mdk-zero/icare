import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  coerceValue,
  DevError,
  findTable,
  getColumns,
  getRelations,
  MAX_PAGE_SIZE,
  parseFilters,
  primaryKeyColumns,
  WRITABLE_SCHEMA,
  type DevColumn,
} from '@/app/lib/dev/catalog';
import { devErrorResponse, devNotFound, requireDeveloper } from '@/app/lib/dev/guard';

type Params = { params: Promise<{ schema: string; table: string }> };

type Row = Record<string, unknown>;

/** Writes go through PostgREST, which only serves the exposed schema. */
function assertWritable(schema: string, kind: string) {
  if (schema !== WRITABLE_SCHEMA) {
    throw new DevError(
      `${schema} is read-only here — PostgREST only exposes ${WRITABLE_SCHEMA}.`,
      400,
    );
  }
  if (kind !== 'table') {
    throw new DevError(`${kind}s cannot be edited`, 400);
  }
}

/**
 * Narrows a query to exactly one row. Every primary-key column must be
 * present: matching on a subset of a composite key would quietly update or
 * delete every row that shares the part that was supplied.
 */
function pkMatch(columns: DevColumn[], supplied: unknown): Row {
  const keys = primaryKeyColumns(columns);
  if (keys.length === 0) {
    throw new DevError('This table has no primary key, so rows cannot be addressed');
  }
  if (!supplied || typeof supplied !== 'object') {
    throw new DevError('pk is required');
  }
  const provided = supplied as Row;
  const match: Row = {};
  for (const key of keys) {
    const value = provided[key.column_name];
    if (value === undefined) {
      throw new DevError(`pk.${key.column_name} is required`);
    }
    match[key.column_name] = coerceValue(key, value);
  }
  return match;
}

function coerceRow(columns: DevColumn[], supplied: unknown): Row {
  if (!supplied || typeof supplied !== 'object') {
    throw new DevError('values must be an object');
  }
  const byName = new Map(columns.map((column) => [column.column_name, column]));
  const out: Row = {};
  for (const [name, raw] of Object.entries(supplied as Row)) {
    const column = byName.get(name);
    if (!column) throw new DevError(`Unknown column: ${name}`);
    // Postgres computes these; sending a value is an error, not an override.
    if (column.is_generated) continue;
    out[name] = coerceValue(column, raw);
  }
  if (Object.keys(out).length === 0) throw new DevError('No columns to write');
  return out;
}

function auditId(match: Row): string {
  return Object.values(match).map((value) => String(value)).join('/');
}

export async function GET(request: NextRequest, { params }: Params) {
  const session = await requireDeveloper();
  if (!session) return devNotFound();

  try {
    const { schema, table } = await params;
    const relation = await findTable(schema, table);
    const columns = await getColumns(schema, table);

    const search = request.nextUrl.searchParams;
    const limit = Math.min(
      Math.max(Number(search.get('limit') ?? 50) || 50, 1),
      MAX_PAGE_SIZE,
    );
    const offset = Math.max(Number(search.get('offset') ?? 0) || 0, 0);
    const descending = search.get('dir') === 'desc';
    const requestedOrder = search.get('order');
    const orderBy =
      requestedOrder && columns.some((column) => column.column_name === requestedOrder)
        ? requestedOrder
        : null;
    const filters = parseFilters(search.get('filters'), columns);
    const withRelations = search.get('relations') === '1';

    const supabase = getSupabaseAdmin();
    let rows: Row[] = [];
    let total: number | null = null;

    if (schema === WRITABLE_SCHEMA) {
      let query = supabase.from(table).select('*', { count: 'exact' });
      for (const filter of filters) {
        query = query.filter(filter.column, filter.op, filter.value);
      }
      if (orderBy) query = query.order(orderBy, { ascending: !descending });
      const { data, error, count } = await query.range(offset, offset + limit - 1);
      if (error) throw new DevError(error.message, 400);
      rows = (data ?? []) as Row[];
      total = count ?? null;
    } else {
      // Unexposed schema: read through the catalog function instead. Filters
      // have no equivalent there, so the console hides them for these tables.
      if (filters.length > 0) {
        throw new DevError(`Filtering is not available on ${schema} tables`);
      }
      const { data, error } = await supabase.rpc('dev_select_rows', {
        p_schema: schema,
        p_table: table,
        p_limit: limit,
        p_offset: offset,
        p_order_by: orderBy,
        p_descending: descending,
      });
      if (error) throw new DevError(error.message, 400);
      const result = (data ?? [])[0] as { rows: Row[]; total: number } | undefined;
      rows = result?.rows ?? [];
      total = result?.total ?? null;
    }

    return NextResponse.json({
      relation,
      columns,
      rows,
      total,
      limit,
      offset,
      writable: schema === WRITABLE_SCHEMA && relation.kind === 'table',
      relations: withRelations ? await getRelations(schema, table) : undefined,
    });
  } catch (err) {
    return devErrorResponse(err);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const session = await requireDeveloper();
  if (!session) return devNotFound();

  try {
    const { schema, table } = await params;
    const relation = await findTable(schema, table);
    assertWritable(schema, relation.kind);

    const body = (await request.json()) as { values?: unknown };
    const columns = await getColumns(schema, table);
    const values = coerceRow(columns, body.values);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.from(table).insert(values).select().single();
    if (error) throw new DevError(error.message, 400);

    await logAudit(
      session,
      {
        action: 'dev.row.insert',
        entityType: `${schema}.${table}`,
        details: { columns: Object.keys(values) },
      },
      request,
    );
    return NextResponse.json({ row: data }, { status: 201 });
  } catch (err) {
    return devErrorResponse(err);
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await requireDeveloper();
  if (!session) return devNotFound();

  try {
    const { schema, table } = await params;
    const relation = await findTable(schema, table);
    assertWritable(schema, relation.kind);

    const body = (await request.json()) as { pk?: unknown; values?: unknown };
    const columns = await getColumns(schema, table);
    const match = pkMatch(columns, body.pk);
    const values = coerceRow(columns, body.values);

    const supabase = getSupabaseAdmin();
    let query = supabase.from(table).update(values);
    for (const [column, value] of Object.entries(match)) {
      query = query.eq(column, value);
    }
    const { data, error } = await query.select();
    if (error) throw new DevError(error.message, 400);
    if (!data || data.length === 0) {
      throw new DevError('No row matched that primary key', 404);
    }

    await logAudit(
      session,
      {
        action: 'dev.row.update',
        entityType: `${schema}.${table}`,
        entityId: auditId(match),
        details: { columns: Object.keys(values) },
      },
      request,
    );
    return NextResponse.json({ row: data[0] });
  } catch (err) {
    return devErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const session = await requireDeveloper();
  if (!session) return devNotFound();

  try {
    const { schema, table } = await params;
    const relation = await findTable(schema, table);
    assertWritable(schema, relation.kind);

    const body = (await request.json()) as { pk?: unknown };
    const columns = await getColumns(schema, table);
    const match = pkMatch(columns, body.pk);

    const supabase = getSupabaseAdmin();
    let query = supabase.from(table).delete();
    for (const [column, value] of Object.entries(match)) {
      query = query.eq(column, value);
    }
    const { data, error } = await query.select();
    if (error) throw new DevError(error.message, 400);
    if (!data || data.length === 0) {
      throw new DevError('No row matched that primary key', 404);
    }

    await logAudit(
      session,
      {
        action: 'dev.row.delete',
        entityType: `${schema}.${table}`,
        entityId: auditId(match),
        details: { deleted: data.length },
      },
      request,
    );
    return NextResponse.json({ deleted: data.length });
  } catch (err) {
    return devErrorResponse(err);
  }
}
