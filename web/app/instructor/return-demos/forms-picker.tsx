"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClipboardList, faEye, faXmark } from "@fortawesome/free-solid-svg-icons";
import { formFields, RETURN_DEMO_FORMS, type ReturnDemoForm } from "../../lib/return-demo-forms";
import { FormPage } from "./form-page";

/**
 * The optional forms of a Return Demonstration (094): printed forms such as
 * the DOH PhilPEN form, which students fill in on the app before they
 * demonstrate the skills. Each can be opened to see the form before adding it.
 */
export default function FormsPicker({
  value,
  onChange,
  disabled = false,
}: {
  /** Picked form keys, in the order they were picked. */
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [preview, setPreview] = useState<ReturnDemoForm | null>(null);
  const toggle = (key: string) => onChange(value.includes(key) ? value.filter((k) => k !== key) : [...value, key]);

  return (
    <div className="rounded-xl border border-hairline bg-surface p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <p className="flex items-center gap-2 text-sm font-bold text-gray-800">
        <FontAwesomeIcon icon={faClipboardList} className="h-3.5 w-3.5 text-brand-600" />
        Forms <span className="font-normal text-gray-500">(optional)</span>
      </p>
      <p className="mt-0.5 text-xs text-gray-500">
        Forms students fill in on the app before the skills. You see their answers on the form while grading; they aren&apos;t scored.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-subtle px-3 py-2.5">
        <span className="text-sm font-semibold text-gray-800">
          {value.length === 0 ? "No forms added" : `${value.length} form${value.length === 1 ? "" : "s"} added`}
        </span>
        {value.map((key) => {
          const form = RETURN_DEMO_FORMS.find((f) => f.key === key);
          return form ? (
            <span key={key} className="rounded-full bg-brand-600/10 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
              {form.title}
            </span>
          ) : null;
        })}
      </div>

      <ul className="mt-2 overflow-hidden rounded-lg border border-hairline">
        {RETURN_DEMO_FORMS.map((form) => {
          const on = value.includes(form.key);
          return (
            <li key={form.key} className="flex items-center gap-2 border-t border-hairline px-3 py-2 first:border-t-0 hover:bg-subtle">
              <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={on}
                  disabled={disabled}
                  onChange={() => toggle(form.key)}
                  className="accent-brand-600"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-gray-800">{form.title}</span>
                  <span className="block truncate text-xs text-gray-500">{form.description}</span>
                </span>
              </label>
              <span className="hidden shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-semibold text-gray-500 sm:inline">
                {formFields(form).length} fields
              </span>
              <button
                type="button"
                onClick={() => setPreview(form)}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-600/40 px-2.5 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-600/5"
              >
                <FontAwesomeIcon icon={faEye} className="h-3 w-3" />
                View form
              </button>
            </li>
          );
        })}
      </ul>

      {preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setPreview(null)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="form-preview-title"
            className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-hairline bg-subtle px-5 py-3">
              <div>
                <h2 id="form-preview-title" className="font-display text-lg font-semibold text-gray-900">
                  {preview.title}
                </h2>
                <p className="text-sm text-gray-500">{preview.description}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreview(null)}
                aria-label="Close"
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_16rem]">
              <FormPage form={preview} className="mx-auto max-w-xl" />
              <div>
                <p className="text-xs font-bold text-gray-800">What students answer</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  On the app, as text boxes, dates and Yes/No choices. Their answers show on this page for you.
                </p>
                <ul className="mt-3 space-y-2">
                  {preview.sections.map((section) => (
                    <li key={section.title} className="rounded-lg border border-hairline px-3 py-2">
                      <p className="text-sm font-semibold text-gray-800">{section.title}</p>
                      <p className="text-xs text-gray-500">
                        {section.fields.map((f) => f.label).join(", ")}
                      </p>
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-xs text-gray-500">{preview.source}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-hairline px-5 py-3">
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (!value.includes(preview.key)) onChange([...value, preview.key]);
                  setPreview(null);
                }}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {value.includes(preview.key) ? "Added" : "Add this form"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
