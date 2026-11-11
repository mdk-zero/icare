"use client";

import { formatFieldValue, type FormRow, type ReturnDemoForm } from "../../lib/return-demo-forms";

/**
 * A form as a sheet: one column per field, one row per entry. With no rows
 * and `blankRows`, it shows the empty sheet, as a preview of what students
 * fill in.
 */
export function FormSheet({
  form,
  rows,
  blankRows = 0,
}: {
  form: ReturnDemoForm;
  rows: readonly FormRow[];
  blankRows?: number;
}) {
  const blanks = rows.length === 0 ? blankRows : 0;
  return (
    <div className="overflow-x-auto rounded-lg border border-hairline">
      <table className="w-full text-sm">
        <thead className="bg-subtle text-left text-xs text-gray-600">
          <tr>
            <th className="w-10 px-3 py-2 font-semibold">#</th>
            {form.fields.map((f) => (
              <th key={f.key} className="px-3 py-2 font-semibold whitespace-nowrap">
                {f.label}
                {f.required && <span className="text-red-600">*</span>}
                {f.unit && <span className="ml-1 font-normal text-gray-400">({f.unit})</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-hairline">
          {rows.map((row, i) => (
            <tr key={i} className="align-top">
              <td className="px-3 py-2 tabular-nums text-gray-400">{i + 1}</td>
              {form.fields.map((f) => (
                <td
                  key={f.key}
                  className={`px-3 py-2 text-gray-800 ${f.type === "longtext" ? "min-w-[14rem] whitespace-pre-line" : "whitespace-nowrap tabular-nums"}`}
                >
                  {formatFieldValue(f, row[f.key])}
                </td>
              ))}
            </tr>
          ))}
          {Array.from({ length: blanks }).map((_, i) => (
            <tr key={`blank-${i}`}>
              <td className="px-3 py-3 tabular-nums text-gray-300">{i + 1}</td>
              {form.fields.map((f) => (
                <td key={f.key} className="px-3 py-3">
                  <span className="block h-4 border-b border-dashed border-gray-300" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
