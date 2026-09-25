"use client";

import { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faUsers,
  faXmark,
  faPlus,
  faTrashCan,
  faFileArrowUp,
  faDownload,
} from "@fortawesome/free-solid-svg-icons";
import { EcgLoader } from "../../components/EcgLoader";
import { loadingToast } from "../../components/Toast";
import { runBulkEnroll } from "./bulk-enroll-runner";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The import format: one student per row, these columns, a header row first. */
const COLUMNS = ["fname", "lname", "email", "sex", "group"] as const;
type Column = (typeof COLUMNS)[number];

/** Header spellings people actually use for each column. */
const HEADER_ALIASES: Record<Column, string[]> = {
  fname: ["fname", "first name", "firstname", "first_name", "given name"],
  lname: ["lname", "last name", "lastname", "last_name", "surname", "family name"],
  email: ["email", "email address", "e-mail"],
  sex: ["sex", "gender"],
  group: ["group", "group name", "team"],
};

type Sex = "" | "male" | "female";

interface DraftRow {
  key: number;
  fname: string;
  lname: string;
  email: string;
  sex: Sex;
  /** Group name within the section; blank leaves them out of every group. */
  group: string;
}

let rowKey = 0;
const emptyRow = (): DraftRow => ({
  key: rowKey++,
  fname: "",
  lname: "",
  email: "",
  sex: "",
  group: "",
});

const isBlank = (r: DraftRow) => !r.fname.trim() && !r.lname.trim() && !r.email.trim();

function parseSex(value: string): Sex {
  const v = value.trim().toLowerCase();
  if (v === "male" || v === "m") return "male";
  if (v === "female" || v === "f") return "female";
  return "";
}

/** RFC 4180-ish: quoted fields may hold commas, quotes ("") and line breaks. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const input = text.replace(/^﻿/, "");
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && input[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/**
 * Turns sheet rows into students. Columns are found by their header names
 * (fname, lname, email, sex, or a common spelling of them); a file without a
 * recognisable header is read in that same order. Rows without an email are
 * skipped.
 */
function rowsToStudents(cells: string[][]): Omit<DraftRow, "key">[] {
  if (cells.length === 0) return [];
  const header = cells[0].map((c) => c.trim().toLowerCase());
  const index: Record<Column, number> = { fname: -1, lname: -1, email: -1, sex: -1, group: -1 };
  for (const col of COLUMNS) index[col] = header.findIndex((h) => HEADER_ALIASES[col].includes(h));
  const hasHeader = index.email !== -1;
  if (!hasHeader) COLUMNS.forEach((col, i) => (index[col] = i));

  return (hasHeader ? cells.slice(1) : cells)
    .map((row) => {
      const get = (col: Column) => (index[col] >= 0 ? (row[index[col]] ?? "").trim() : "");
      return {
        fname: get("fname"),
        lname: get("lname"),
        email: get("email"),
        sex: parseSex(get("sex")),
        group: get("group"),
      };
    })
    .filter((s) => s.email);
}

async function readFile(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    // Loaded only when an Excel file is picked, so the page doesn't carry it.
    const { readSheet } = await import("read-excel-file/browser");
    const data = await readSheet(file);
    return data.map((row) => row.map((cell) => (cell == null ? "" : String(cell))));
  }
  return parseCsv(await file.text());
}

const inputClass =
  "min-w-0 rounded-lg border border-gray-200 bg-surface px-2.5 py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-60";

/**
 * Enrolls a batch of students into one section: import a CSV or Excel file in
 * the template's format, or type them in. Each account gets a temporary
 * password emailed to the student; any that can't be mailed are listed with
 * their password so it can be handed over.
 */
export default function BulkEnrollModal({
  sectionId,
  sectionName,
  groups,
  onClose,
  onFinished,
}: {
  sectionId: string;
  sectionName: string;
  /** The section's existing groups, matched by name (any letter case). */
  groups: { id: string; name: string }[];
  onClose: () => void;
  onFinished: (created: number) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [importNote, setImportNote] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [importing, setImporting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Students the file leaves without a group are grouped automatically: into
  // the section's smallest groups when it has some, or into new groups of
  // `groupSize` when it has none.
  const [autoGroup, setAutoGroup] = useState(true);
  const [groupSize, setGroupSize] = useState("2");

  const filled = rows.filter((r) => !isBlank(r));

  const update = (key: number, patch: Partial<DraftRow>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const importFile = async (file: File) => {
    setImportNote(null);
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      setImportNote({ tone: "error", text: "Choose a .csv or .xlsx file." });
      return;
    }
    setImporting(true);
    const progress = loadingToast(`Reading ${file.name}…`);
    try {
      const students = rowsToStudents(await readFile(file));
      if (students.length === 0) {
        progress.error(`No students found in ${file.name}`);
        setImportNote({
          tone: "error",
          text: `No students found in ${file.name}. Check it has an email column, like the template.`,
        });
      } else {
        // Imported rows join what's already typed, minus any blank rows.
        setRows((prev) => [
          ...prev.filter((r) => !isBlank(r)),
          ...students.map((s) => ({ ...emptyRow(), ...s })),
        ]);
        progress.success(`Imported ${students.length} student${students.length === 1 ? "" : "s"} from ${file.name}`);
        setImportNote({
          tone: "ok",
          text: `Added ${students.length} student${students.length === 1 ? "" : "s"} from ${file.name}. Check them below before enrolling.`,
        });
      }
    } catch {
      progress.error(`${file.name} couldn't be read`);
      setImportNote({ tone: "error", text: `${file.name} couldn't be read. Save it as .csv or .xlsx and try again.` });
    } finally {
      setImporting(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const validate = (): string | null => {
    if (filled.length === 0) return "Import a file or add at least one student.";
    const seen = new Set<string>();
    for (const row of filled) {
      if (!row.fname.trim() || !row.lname.trim())
        return `${row.email.trim() || "A student"} needs a first and last name.`;
      if (!EMAIL_REGEX.test(row.email.trim())) return `"${row.email.trim() || "(blank)"}" is not a valid email.`;
      const email = row.email.trim().toLowerCase();
      if (seen.has(email)) return `${email} appears twice in this batch.`;
      seen.add(email);
    }
    return null;
  };

  /** Hands the batch to the background runner and closes; progress shows in the tray. */
  const handleSubmit = () => {
    const problem = validate();
    if (problem) {
      setFormError(problem);
      return;
    }
    runBulkEnroll({
      sectionId,
      sectionName,
      groups,
      students: filled.map(({ fname, lname, email, sex, group }) => ({ fname, lname, email, sex, group })),
      autoGroup,
      groupSize: Math.max(1, Math.floor(Number(groupSize)) || 1),
      onDone: () => onFinished(filled.length),
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline bg-subtle px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/10">
              <FontAwesomeIcon icon={faUsers} className="h-5 w-5 text-brand-600" />
            </span>
            <div>
              <h2 id="bulk-title" className="font-display text-lg font-semibold text-gray-900">
                Bulk enroll into {sectionName}
              </h2>
              <p className="text-sm text-gray-500">Import a class list, or add students by hand. Enrolling runs in the background.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          <section>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files[0];
                if (file) void importFile(file);
              }}
              className="rounded-xl border-2 border-dashed border-gray-300 bg-subtle/50 px-5 py-6 text-center"
            >
              <FontAwesomeIcon icon={faFileArrowUp} className="h-7 w-7 text-brand-600" />
              <p className="mt-2 font-medium text-gray-800">Import a CSV or Excel file</p>
              <p className="mt-0.5 text-sm text-gray-500">Drop it here, or</p>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={importing}
                className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
              >
                {importing && <EcgLoader size="xs" />}
                {importing ? "Reading file…" : "Choose file"}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importFile(file);
                }}
              />
            </div>

            {importNote && (
              <p
                className={`mt-2 rounded-lg px-3 py-2 text-sm ${
                  importNote.tone === "ok"
                    ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border border-rose-200 bg-rose-50 text-rose-700"
                }`}
              >
                {importNote.text}
              </p>
            )}

            {/* The format, with the columns spelled out and a template to fill in. */}
            <div className="mt-3 rounded-xl border border-hairline p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-gray-800">File format</p>
                  <p className="text-sm text-gray-500">
                    A header row, then one student per row. Sex (male or female) and group are optional; a group that doesn&apos;t exist yet is created.
                  </p>
                </div>
                <div className="flex gap-2">
                  <a
                    href="/templates/bulk-enroll-template.csv"
                    download="bulk-enroll-template.csv"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-surface px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-brand-300 hover:text-brand-700"
                  >
                    <FontAwesomeIcon icon={faDownload} className="h-3 w-3" />
                    CSV template
                  </a>
                  <a
                    href="/templates/bulk-enroll-template.xlsx"
                    download="bulk-enroll-template.xlsx"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-surface px-3 py-1.5 text-sm font-medium text-gray-700 hover:border-brand-300 hover:text-brand-700"
                  >
                    <FontAwesomeIcon icon={faDownload} className="h-3 w-3" />
                    Excel template
                  </a>
                </div>
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[34rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-hairline">
                      {COLUMNS.map((c) => (
                        <th key={c} className="px-2 py-1.5 font-mono text-xs font-semibold text-brand-700">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="text-gray-500">
                    <tr>
                      <td className="px-2 py-1.5">Juan</td>
                      <td className="px-2 py-1.5">Dela Cruz</td>
                      <td className="px-2 py-1.5">23-12345@g.batstate-u.edu.ph</td>
                      <td className="px-2 py-1.5">male</td>
                      <td className="px-2 py-1.5">Group A</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">
                Students <span className="font-normal text-gray-400">({filled.length})</span>
              </span>
              {rows.length > 0 && (
                <button
                  type="button"
                  onClick={() => setRows([])}
                  className="text-xs font-medium text-gray-400 hover:text-rose-600"
                >
                  Clear list
                </button>
              )}
            </div>

            {rows.length === 0 ? (
              <p className="rounded-lg border border-hairline px-3 py-4 text-center text-sm text-gray-400">
                Nobody yet. Import a file, or add students by hand.
              </p>
            ) : (
              <div className="space-y-2">
                {rows.map((row, i) => {
                  return (
                    <div key={row.key} className="flex items-start gap-2">
                      <span className="mt-2.5 w-5 shrink-0 text-right text-[11px] tabular-nums text-gray-400">
                        {i + 1}
                      </span>
                      <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-[1fr_1fr_1.5fr_6rem_6.5rem]">
                        <input
                          value={row.fname}
                          onChange={(e) => update(row.key, { fname: e.target.value })}
                          placeholder="First name"
                          aria-label={`Student ${i + 1} first name`}
                          className={inputClass}
                        />
                        <input
                          value={row.lname}
                          onChange={(e) => update(row.key, { lname: e.target.value })}
                          placeholder="Last name"
                          aria-label={`Student ${i + 1} last name`}
                          className={inputClass}
                        />
                        <input
                          value={row.email}
                          onChange={(e) => update(row.key, { email: e.target.value })}
                          placeholder="Email"
                          aria-label={`Student ${i + 1} email`}
                          className={inputClass}
                        />
                        <select
                          value={row.sex}
                          onChange={(e) => update(row.key, { sex: e.target.value as Sex })}
                          aria-label={`Student ${i + 1} sex`}
                          className={inputClass}
                        >
                          <option value="">Sex</option>
                          <option value="female">Female</option>
                          <option value="male">Male</option>
                        </select>
                        <input
                          value={row.group}
                          onChange={(e) => update(row.key, { group: e.target.value })}
                          placeholder="Group"
                          list="bulk-groups"
                          aria-label={`Student ${i + 1} group`}
                          className={inputClass}
                        />
                      </div>
                      <span className="mt-2.5 flex w-5 shrink-0 justify-center">
                        <button
                          type="button"
                          onClick={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                          aria-label={`Remove student ${i + 1}`}
                          className="text-gray-300 transition-colors hover:text-rose-500"
                        >
                          <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <datalist id="bulk-groups">
              {groups.map((g) => (
                <option key={g.id} value={g.name} />
              ))}
            </datalist>

            <button
              type="button"
              onClick={() => setRows((prev) => [...prev, emptyRow()])}
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:border-brand-300 hover:text-brand-700"
            >
              <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
              Add a student by hand
            </button>
          </section>

          {filled.some((r) => !r.group.trim()) && (
            <label className="flex items-start gap-3 rounded-xl border border-hairline bg-subtle/50 p-4">
              <input
                type="checkbox"
                checked={autoGroup}
                onChange={(e) => setAutoGroup(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-brand-600"
              />
              <span className="text-sm">
                <span className="font-medium text-gray-800">Group students who have no group</span>
                <span className="mt-0.5 block text-gray-500">
                  {groups.length > 0 ? (
                    `Each one joins the smallest of ${sectionName}'s ${groups.length} group${groups.length === 1 ? "" : "s"}, keeping them even.`
                  ) : (
                    <>
                      {sectionName} has no groups yet, so the whole section is split into groups of{" "}
                      <input
                        type="number"
                        min={1}
                        value={groupSize}
                        onChange={(e) => setGroupSize(e.target.value)}
                        onClick={(e) => e.preventDefault()}
                        aria-label="Students per group"
                        className="mx-1 inline-block w-14 rounded-md border border-gray-200 bg-surface px-2 py-0.5 text-center text-sm text-gray-800 focus:border-brand-600 focus:outline-none"
                      />
                      students.
                    </>
                  )}
                </span>
              </span>
            </label>
          )}

          {formError && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">{formError}</p>
          )}

        </div>

        <div className="flex items-center justify-end gap-3 border-t border-hairline bg-subtle px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 bg-surface px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={filled.length === 0}
            className="rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-700 disabled:opacity-60"
          >
            {filled.length > 0
              ? `Enroll ${filled.length} student${filled.length === 1 ? "" : "s"}`
              : "Enroll students"}
          </button>
        </div>
      </div>
    </div>
  );
}
