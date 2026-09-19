"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

const inputClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 placeholder:text-gray-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm shadow-sm";

const selectClassName =
  "w-full px-4 py-3 bg-surface border border-gray-400 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 focus:bg-surface transition-all text-sm appearance-none shadow-sm cursor-pointer";

const NEW_OPTION = "__new__";

/**
 * A scenario category: pick one from the stored list, or type a new one,
 * which the scenario API creates on save.
 *
 * A value the list doesn't hold (e.g. one typed earlier) shows as free text
 * so saving can't silently rewrite it — but only once the list has loaded,
 * or every stored category would flash as "new" first.
 */
export default function CategoryPicker({
  value,
  onChange,
  categories,
  loading,
}: {
  value: string;
  onChange: (category: string) => void;
  categories: string[];
  loading: boolean;
}) {
  const [typing, setTyping] = useState(false);
  const known = categories.some((c) => c.toLowerCase() === value.trim().toLowerCase());
  const custom = typing || (!loading && value !== "" && !known);

  if (custom) {
    return (
      <div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="New category name"
          maxLength={60}
          className={inputClassName}
        />
        <button
          type="button"
          onClick={() => {
            setTyping(false);
            onChange("");
          }}
          className="mt-1.5 text-xs font-medium text-brand-600 hover:text-brand-700"
        >
          Choose an existing category instead
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => {
          if (e.target.value === NEW_OPTION) {
            setTyping(true);
            onChange("");
          } else {
            onChange(e.target.value);
          }
        }}
        className={selectClassName + " pr-10"}
      >
        <option value="">{loading ? "Loading categories…" : "Select category"}</option>
        {/* While the list loads, keep the current value selectable. */}
        {value && !known && <option value={value}>{value}</option>}
        {categories.map((cat) => (
          <option key={cat} value={cat}>
            {cat}
          </option>
        ))}
        <option value={NEW_OPTION}>➕ Create new category…</option>
      </select>
      <FontAwesomeIcon
        icon={faChevronDown}
        className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none"
      />
    </div>
  );
}
