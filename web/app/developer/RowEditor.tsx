"use client";

import { useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTrash, faXmark } from "@fortawesome/free-solid-svg-icons";
import {
  devFetch,
  editValue,
  isMultilineColumn,
  type DevColumn,
  type Row,
} from "./types";
import { EcgLoader } from "../components/EcgLoader";

interface RowEditorProps {
  schema: string;
  table: string;
  columns: DevColumn[];
  /** Null opens the editor on a new row. */
  row: Row | null;
  writable: boolean;
  onClose: () => void;
  onSaved: (row: Row) => void;
  onDeleted: () => void;
}

/**
 * Only what you actually touched is sent.
 *
 * Posting every field back would overwrite columns changed by someone else
 * between the read and the save, and would send a `null` for every column the
 * grid could not render — an edit to one cell is an edit to one column.
 */
export default function RowEditor({
  schema,
  table,
  columns,
  row,
  writable,
  onClose,
  onSaved,
  onDeleted,
}: RowEditorProps) {
  const inserting = row === null;
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const pkColumns = useMemo(
    () => columns.filter((column) => column.is_primary_key),
    [columns],
  );

  const set = (name: string, value: string) => {
    setDraft((previous) => ({ ...previous, [name]: value }));
    setTouched((previous) => new Set(previous).add(name));
  };

  const valueOf = (column: DevColumn): string =>
    touched.has(column.column_name)
      ? draft[column.column_name]
      : editValue(row?.[column.column_name]);

  /** A primary key identifies the row; changing one is a different operation. */
  const isLocked = (column: DevColumn) =>
    column.is_generated || (!inserting && column.is_primary_key);

  const payload = (): Row => {
    const out: Row = {};
    for (const name of touched) {
      const column = columns.find((entry) => entry.column_name === name);
      if (!column || isLocked(column)) continue;
      out[name] = draft[name];
    }
    return out;
  };

  const pk = (): Row => {
    const out: Row = {};
    for (const column of pkColumns) out[column.column_name] = row?.[column.column_name];
    return out;
  };

  const save = async () => {
    const values = payload();
    if (Object.keys(values).length === 0) {
      setError("Nothing changed");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const base = `/api/dev/tables/${schema}/${table}`;
      const result = inserting
        ? await devFetch<{ row: Row }>(base, {
            method: "POST",
            body: JSON.stringify({ values }),
          })
        : await devFetch<{ row: Row }>(base, {
            method: "PATCH",
            body: JSON.stringify({ pk: pk(), values }),
          });
      onSaved(result.row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await devFetch(`/api/dev/tables/${schema}/${table}`, {
        method: "DELETE",
        body: JSON.stringify({ pk: pk() }),
      });
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside
      className="dc-drawer dc-scroll flex w-[420px] shrink-0 flex-col overflow-y-auto border-l"
      style={{ borderColor: "var(--dc-line)", background: "var(--dc-panel)" }}
    >
      <header
        className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--dc-line)", background: "var(--dc-panel)" }}
      >
        <div className="min-w-0">
          <p className="text-[13px] font-semibold">{inserting ? "New row" : "Edit row"}</p>
          <p className="truncate font-mono text-[11px]" style={{ color: "var(--dc-dim)" }}>
            {schema}.{table}
          </p>
        </div>
        <button className="dc-btn dc-btn-ghost" onClick={onClose} aria-label="Close editor">
          <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
        </button>
      </header>

      <div className="flex-1 space-y-3.5 px-4 py-4">
        {columns.map((column) => {
          const locked = isLocked(column) || !writable;
          const current = valueOf(column);
          return (
            <label key={column.column_name} className="block">
              <span className="mb-1 flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[12px] font-medium">{column.column_name}</span>
                <span className="dc-tag">{column.data_type}</span>
                {column.is_primary_key && <span className="dc-tag dc-tag-key">pk</span>}
                {column.references_table && (
                  <span className="dc-tag dc-tag-fk" title={`→ ${column.references_table}.${column.references_column}`}>
                    fk
                  </span>
                )}
                {column.is_generated && <span className="dc-tag">generated</span>}
                {!column.is_nullable && !column.is_primary_key && (
                  <span className="dc-tag" style={{ color: "var(--dc-warn)" }}>
                    not null
                  </span>
                )}
              </span>

              {column.options ? (
                <select
                  className="dc-field"
                  value={current}
                  disabled={locked}
                  onChange={(event) => set(column.column_name, event.target.value)}
                >
                  {column.is_nullable && <option value="">— null —</option>}
                  {!column.options.includes(current) && current !== "" && (
                    <option value={current}>{current}</option>
                  )}
                  {column.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : column.udt_name === "bool" ? (
                <select
                  className="dc-field"
                  value={current}
                  disabled={locked}
                  onChange={(event) => set(column.column_name, event.target.value)}
                >
                  {column.is_nullable && <option value="">— null —</option>}
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              ) : isMultilineColumn(column) ? (
                <textarea
                  className="dc-field"
                  rows={column.udt_name === "text" ? 3 : 4}
                  value={current}
                  disabled={locked}
                  placeholder={inserting && column.default_expr ? column.default_expr : undefined}
                  onChange={(event) => set(column.column_name, event.target.value)}
                />
              ) : (
                <input
                  className="dc-field font-mono"
                  value={current}
                  disabled={locked}
                  placeholder={
                    inserting && column.default_expr
                      ? column.default_expr
                      : column.is_nullable
                        ? "null"
                        : undefined
                  }
                  onChange={(event) => set(column.column_name, event.target.value)}
                />
              )}
            </label>
          );
        })}

        {columns.some((column) => column.is_nullable) && (
          <p className="pt-1 text-[11px] leading-relaxed" style={{ color: "var(--dc-dim)" }}>
            An empty field writes NULL to a nullable column. On insert, a field you
            never touch takes the column&apos;s database default.
          </p>
        )}
      </div>

      <footer
        className="sticky bottom-0 space-y-2.5 border-t px-4 py-3"
        style={{ borderColor: "var(--dc-line)", background: "var(--dc-panel)" }}
      >
        {error && (
          <p
            className="rounded-md border px-2.5 py-2 font-mono text-[11px] leading-relaxed"
            style={{ borderColor: "#4a2730", background: "#1e1418", color: "var(--dc-danger)" }}
          >
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <button className="dc-btn dc-btn-accent" onClick={save} disabled={busy || !writable}>
            {busy && <EcgLoader size="xs" />}
            {inserting ? "Insert row" : "Save changes"}
          </button>
          <button className="dc-btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          {!inserting && writable && pkColumns.length > 0 && (
            <button
              className="dc-btn dc-btn-danger ml-auto"
              onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}
              disabled={busy}
            >
              <FontAwesomeIcon icon={faTrash} className="h-3 w-3" />
              {confirmDelete ? "Confirm delete" : "Delete"}
            </button>
          )}
        </div>
      </footer>
    </aside>
  );
}
