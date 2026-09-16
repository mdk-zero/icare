"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowUp,
  faArrowsRotate,
  faMagnifyingGlass,
  faPlus,
  faSpinner,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import RowEditor from "./RowEditor";
import {
  devFetch,
  displayValue,
  formatBytes,
  type DevTable,
  type Row,
  type TablePage,
} from "./types";

interface Filter {
  column: string;
  op: string;
  value: string;
}

const FILTER_OPS = [
  { value: "eq", label: "=" },
  { value: "neq", label: "≠" },
  { value: "gt", label: ">" },
  { value: "gte", label: "≥" },
  { value: "lt", label: "<" },
  { value: "lte", label: "≤" },
  { value: "ilike", label: "contains" },
  { value: "is", label: "is" },
  { value: "in", label: "in" },
];

const PAGE_SIZES = [25, 50, 100, 200];

/** `ilike` needs the wildcards the operator label implies but does not send. */
function filterValue(filter: Filter): string {
  if (filter.op === "ilike" || filter.op === "like") return `*${filter.value}*`;
  if (filter.op === "in") return `(${filter.value})`;
  return filter.value;
}

export default function TablesPanel() {
  const [tables, setTables] = useState<DevTable[]>([]);
  const [tablesError, setTablesError] = useState<string | null>(null);
  const [railSearch, setRailSearch] = useState("");
  const [selected, setSelected] = useState<DevTable | null>(null);

  const [page, setPage] = useState<TablePage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [offset, setOffset] = useState(0);
  const [limit, setLimit] = useState(50);
  const [order, setOrder] = useState<string | null>(null);
  const [descending, setDescending] = useState(false);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [draftFilter, setDraftFilter] = useState<Filter>({ column: "", op: "eq", value: "" });

  const [editing, setEditing] = useState<{ row: Row | null } | null>(null);

  useEffect(() => {
    devFetch<{ tables: DevTable[] }>("/api/dev/tables")
      .then((result) => setTables(result.tables))
      .catch((err: Error) => setTablesError(err.message));
  }, []);

  /**
   * Guards against a slow read landing after a faster one. Clicking through
   * the rail fires a request per table, and without this the grid can settle
   * showing rows from a table you already navigated away from.
   */
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!selected) return;
    const token = ++request.current;
    setLoading(true);
    setError(null);
    try {
      const search = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (order) {
        search.set("order", order);
        search.set("dir", descending ? "desc" : "asc");
      }
      if (filters.length > 0) {
        search.set(
          "filters",
          JSON.stringify(filters.map((f) => ({ ...f, value: filterValue(f) }))),
        );
      }
      const result = await devFetch<TablePage>(
        `/api/dev/tables/${selected.schema_name}/${selected.table_name}?${search}`,
      );
      if (token !== request.current) return;
      setPage(result);
    } catch (err) {
      if (token !== request.current) return;
      setPage(null);
      setError(err instanceof Error ? err.message : "Failed to load rows");
    } finally {
      if (token === request.current) setLoading(false);
    }
  }, [selected, limit, offset, order, descending, filters]);

  useEffect(() => {
    // The query IS the external system here — selection, sort, paging and
    // filters are the inputs, and a fetch is the only way to satisfy them.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const grouped = useMemo(() => {
    const term = railSearch.trim().toLowerCase();
    const matching = term
      ? tables.filter((table) =>
          `${table.schema_name}.${table.table_name}`.toLowerCase().includes(term),
        )
      : tables;
    const bySchema = new Map<string, DevTable[]>();
    for (const table of matching) {
      const list = bySchema.get(table.schema_name) ?? [];
      list.push(table);
      bySchema.set(table.schema_name, list);
    }
    return [...bySchema.entries()];
  }, [tables, railSearch]);

  const select = (table: DevTable) => {
    setSelected(table);
    setEditing(null);
    setPage(null);
    setOffset(0);
    setOrder(null);
    setDescending(false);
    setFilters([]);
    setDraftFilter({ column: "", op: "eq", value: "" });
  };

  const sortBy = (column: string) => {
    setOffset(0);
    if (order === column) {
      setDescending((previous) => !previous);
      return;
    }
    setOrder(column);
    setDescending(false);
  };

  const addFilter = () => {
    if (!draftFilter.column) return;
    setFilters((previous) => [...previous, draftFilter]);
    setDraftFilter({ column: draftFilter.column, op: "eq", value: "" });
    setOffset(0);
  };

  const shown = page?.rows.length ?? 0;
  const canFilter = selected?.schema_name === "public";

  return (
    <div className="flex min-h-0 flex-1">
      {/* Rail */}
      <nav
        className="dc-scroll flex w-60 shrink-0 flex-col overflow-y-auto border-r"
        style={{ borderColor: "var(--dc-line)" }}
      >
        <div
          className="sticky top-0 z-10 p-2.5"
          style={{ background: "var(--dc-bg)" }}
        >
          <div className="relative">
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2"
              style={{ color: "var(--dc-dim)" }}
            />
            <input
              className="dc-field pl-7"
              placeholder="Filter tables"
              value={railSearch}
              onChange={(event) => setRailSearch(event.target.value)}
            />
          </div>
        </div>
        <div className="dc-rail space-y-4 px-2 pb-6">
          {tablesError && (
            <p className="px-1 text-[11px] leading-relaxed" style={{ color: "var(--dc-danger)" }}>
              {tablesError}
            </p>
          )}
          {grouped.map(([schema, entries]) => (
            <div key={schema}>
              <p
                className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "#4e6469" }}
              >
                {schema} · {entries.length}
              </p>
              {entries.map((table) => (
                <button
                  key={`${schema}.${table.table_name}`}
                  data-selected={
                    selected?.schema_name === schema && selected?.table_name === table.table_name
                  }
                  onClick={() => select(table)}
                  title={`${table.kind} · ~${table.row_estimate.toLocaleString()} rows · ${formatBytes(table.total_bytes)}`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate font-mono">{table.table_name}</span>
                    <span className="shrink-0 text-[10px]" style={{ color: "#4e6469" }}>
                      {table.kind === "table" ? table.row_estimate.toLocaleString() : table.kind.slice(0, 4)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </nav>

      {/* Grid */}
      <section className="flex min-w-0 flex-1 flex-col">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center px-8 text-center">
            <div>
              <p className="text-[13px]" style={{ color: "var(--dc-dim)" }}>
                Pick a table to browse it.
              </p>
              <p className="mt-1 text-[11.5px]" style={{ color: "#4e6469" }}>
                {tables.length} relations, read straight from the live catalog.
              </p>
            </div>
          </div>
        ) : (
          <>
            <header
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5"
              style={{ borderColor: "var(--dc-line)" }}
            >
              <h2 className="font-mono text-[13px] font-semibold">
                <span style={{ color: "var(--dc-dim)" }}>{selected.schema_name}.</span>
                {selected.table_name}
              </h2>
              {!page?.writable && (
                <span className="dc-tag" title="Not writable from here">
                  read-only
                </span>
              )}
              {page?.total !== null && page?.total !== undefined && (
                <span className="text-[11.5px]" style={{ color: "var(--dc-dim)" }}>
                  {page.total.toLocaleString()} rows
                </span>
              )}
              <div className="ml-auto flex items-center gap-2">
                <button className="dc-btn" onClick={() => void load()} disabled={loading}>
                  <FontAwesomeIcon
                    icon={loading ? faSpinner : faArrowsRotate}
                    className={`h-3 w-3 ${loading ? "animate-spin" : ""}`}
                  />
                  Refresh
                </button>
                <button
                  className="dc-btn dc-btn-accent"
                  onClick={() => setEditing({ row: null })}
                  disabled={!page?.writable}
                  title={page?.writable ? "Insert a row" : "This relation cannot be written to"}
                >
                  <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                  New row
                </button>
              </div>
            </header>

            {canFilter && page && (
              <div
                className="flex flex-wrap items-center gap-2 border-b px-4 py-2"
                style={{ borderColor: "var(--dc-line-soft)" }}
              >
                <select
                  className="dc-field w-40"
                  value={draftFilter.column}
                  onChange={(event) =>
                    setDraftFilter((previous) => ({ ...previous, column: event.target.value }))
                  }
                >
                  <option value="">column…</option>
                  {page.columns.map((column) => (
                    <option key={column.column_name} value={column.column_name}>
                      {column.column_name}
                    </option>
                  ))}
                </select>
                <select
                  className="dc-field w-28"
                  value={draftFilter.op}
                  onChange={(event) =>
                    setDraftFilter((previous) => ({ ...previous, op: event.target.value }))
                  }
                >
                  {FILTER_OPS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {op.label}
                    </option>
                  ))}
                </select>
                <input
                  className="dc-field w-52 font-mono"
                  placeholder={draftFilter.op === "is" ? "null" : "value"}
                  value={draftFilter.value}
                  onChange={(event) =>
                    setDraftFilter((previous) => ({ ...previous, value: event.target.value }))
                  }
                  onKeyDown={(event) => event.key === "Enter" && addFilter()}
                />
                <button className="dc-btn" onClick={addFilter} disabled={!draftFilter.column}>
                  Add filter
                </button>
                {filters.map((filter, index) => (
                  <button
                    key={`${filter.column}-${index}`}
                    className="dc-btn"
                    style={{ borderColor: "rgba(94,234,212,0.3)", color: "var(--dc-accent)" }}
                    onClick={() => {
                      setFilters((previous) => previous.filter((_, i) => i !== index));
                      setOffset(0);
                    }}
                    title="Remove this filter"
                  >
                    <span className="font-mono">
                      {filter.column} {FILTER_OPS.find((op) => op.value === filter.op)?.label}{" "}
                      {filter.value}
                    </span>
                    <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
                  </button>
                ))}
              </div>
            )}

            <div className="dc-scroll min-h-0 flex-1 overflow-auto">
              {error ? (
                <p
                  className="m-4 rounded-md border px-3 py-2.5 font-mono text-[11.5px] leading-relaxed"
                  style={{ borderColor: "#4a2730", background: "#1e1418", color: "var(--dc-danger)" }}
                >
                  {error}
                </p>
              ) : !page ? (
                <p className="p-4 text-[12px]" style={{ color: "var(--dc-dim)" }}>
                  Loading…
                </p>
              ) : page.rows.length === 0 ? (
                <p className="p-4 text-[12px]" style={{ color: "var(--dc-dim)" }}>
                  No rows{filters.length > 0 ? " match these filters" : ""}.
                </p>
              ) : (
                <table className="dc-grid">
                  <thead>
                    <tr>
                      {page.columns.map((column) => (
                        <th
                          key={column.column_name}
                          className={canFilter ? "sortable" : undefined}
                          onClick={canFilter ? () => sortBy(column.column_name) : undefined}
                          title={`${column.data_type}${column.is_nullable ? "" : " not null"}`}
                        >
                          <span className="flex items-center gap-1.5">
                            {column.is_primary_key && (
                              <span style={{ color: "var(--dc-warn)" }}>◆</span>
                            )}
                            {column.column_name}
                            {order === column.column_name && (
                              <FontAwesomeIcon
                                icon={descending ? faArrowDown : faArrowUp}
                                className="h-2.5 w-2.5"
                                style={{ color: "var(--dc-accent)" }}
                              />
                            )}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {page.rows.map((row, index) => (
                      <tr
                        key={index}
                        onClick={() => page.writable && setEditing({ row })}
                        style={{ cursor: page.writable ? "pointer" : "default" }}
                      >
                        {page.columns.map((column) => {
                          const value = row[column.column_name];
                          const text = displayValue(value);
                          return (
                            <td key={column.column_name} title={text}>
                              {value === null || value === undefined ? (
                                <span className="dc-null">null</span>
                              ) : (
                                text
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <footer
              className="flex items-center gap-3 border-t px-4 py-2 text-[11.5px]"
              style={{ borderColor: "var(--dc-line)", color: "var(--dc-dim)" }}
            >
              <span>
                {shown === 0 ? "0" : `${(offset + 1).toLocaleString()}–${(offset + shown).toLocaleString()}`}
                {page?.total !== null && page?.total !== undefined
                  ? ` of ${page.total.toLocaleString()}`
                  : ""}
              </span>
              <div className="ml-auto flex items-center gap-2">
                <select
                  className="dc-field w-auto"
                  value={limit}
                  onChange={(event) => {
                    setLimit(Number(event.target.value));
                    setOffset(0);
                  }}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size} / page
                    </option>
                  ))}
                </select>
                <button
                  className="dc-btn"
                  onClick={() => setOffset((previous) => Math.max(previous - limit, 0))}
                  disabled={offset === 0 || loading}
                >
                  Previous
                </button>
                <button
                  className="dc-btn"
                  onClick={() => setOffset((previous) => previous + limit)}
                  disabled={loading || shown < limit}
                >
                  Next
                </button>
              </div>
            </footer>
          </>
        )}
      </section>

      {editing && selected && page && (
        <RowEditor
          schema={selected.schema_name}
          table={selected.table_name}
          columns={page.columns}
          row={editing.row}
          writable={page.writable}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
          onDeleted={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
