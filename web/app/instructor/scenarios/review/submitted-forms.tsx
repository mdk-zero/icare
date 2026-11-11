"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faClipboardList, faXmark } from "@fortawesome/free-solid-svg-icons";
import { fetchAssignmentForms } from "../../../lib/api";
import { usePageData } from "../../../lib/use-page-data";
import { FormSheet } from "../../return-demos/form-sheet";
import { formatWhen } from "./assignment-list";

/**
 * The forms on a student's Return Demonstration (094), kept at the top of the
 * grading sheet so they aren't buried under the skills' checklists: a line
 * saying how many are handed in, and a button that opens them.
 * Renders nothing when the Return Demonstration has no forms.
 */
export default function SubmittedForms({ assignmentId }: { assignmentId: string }) {
  const { data: forms } = usePageData(`faculty:assignment-forms:${assignmentId}`, () =>
    fetchAssignmentForms(assignmentId),
  );
  const [open, setOpen] = useState(false);
  if (!forms || forms.length === 0) return null;

  const handedIn = forms.filter((f) => f.submitted_at).length;
  return (
    <>
      <div className="flex flex-wrap items-center gap-3 border-b border-hairline bg-brand-600/5 px-5 py-2.5 sm:px-6">
        <FontAwesomeIcon icon={faClipboardList} className="h-3.5 w-3.5 text-brand-600" />
        <span className="text-sm text-gray-700">
          <span className="font-semibold">
            {forms.length} form{forms.length === 1 ? "" : "s"}
          </span>{" "}
          · {handedIn === forms.length ? "all handed in" : `${handedIn} of ${forms.length} handed in`}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"
        >
          View submitted forms
        </button>
      </div>

      {/* On <body>: the sticky header this sits in would otherwise clip it. */}
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="submitted-forms-title"
              className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-hairline bg-subtle px-5 py-3">
                <h2 id="submitted-forms-title" className="font-display text-lg font-semibold text-gray-900">
                  Submitted forms
                </h2>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                >
                  <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
                </button>
              </div>
              <div className="space-y-6 overflow-y-auto p-5">
                {forms.map((form) => (
                  <section key={form.key}>
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="font-semibold text-gray-900">{form.title}</h3>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          form.submitted_at
                            ? "bg-emerald-50 text-emerald-700"
                            : form.rows.length
                              ? "bg-amber-50 text-amber-700"
                              : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {form.submitted_at
                          ? `Handed in ${formatWhen(form.submitted_at)}`
                          : form.rows.length
                            ? "Started, not handed in"
                            : "Not started"}
                      </span>
                    </div>
                    {form.rows.length > 0 ? (
                      <FormSheet form={form} rows={form.rows} />
                    ) : (
                      <p className="rounded-lg border border-dashed border-gray-300 px-4 py-5 text-center text-sm text-gray-500">
                        Nothing entered yet.
                      </p>
                    )}
                  </section>
                ))}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
