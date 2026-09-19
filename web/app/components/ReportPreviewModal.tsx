"use client";

import { useEffect } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faArrowUpRightFromSquare,
  faArrowsRotate,
  faFileCsv,
  faFilePdf,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { EcgLoader } from "./EcgLoader";
import type { ReportFormat } from "../lib/reports/client";

export type PreviewState =
  | { status: "loading" }
  | { status: "error"; error: string }
  /** `url` is an object URL the owner created and will revoke. */
  | { status: "ready"; url: string };

/**
 * A generated PDF, shown before it is saved. The owner fetches the report and
 * holds the blob, so "Download PDF" here saves the very file on screen rather
 * than asking the server to build it a second time.
 */
export default function ReportPreviewModal({
  icon,
  kind,
  subject,
  state,
  downloading,
  onDownload,
  onRetry,
  onClose,
}: {
  icon: IconDefinition;
  /** "Student report" */
  kind: string;
  /** "Jane Cruz" */
  subject: string;
  state: PreviewState;
  downloading: ReportFormat | null;
  onDownload: (format: ReportFormat) => void;
  onRetry: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-preview-title"
        className="flex h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-hairline bg-subtle px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/10">
              <FontAwesomeIcon icon={icon} className="h-4 w-4 text-brand-600" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500">{kind}</p>
              <h2
                id="report-preview-title"
                className="truncate font-display text-lg font-semibold text-gray-900"
              >
                {subject}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close preview"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>

        <div className="relative min-h-0 flex-1 bg-gray-100">
          {state.status === "loading" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-gray-500">
              <EcgLoader size="md" className="text-brand-600" />
              Building the report from live records…
            </div>
          )}

          {state.status === "error" && (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="max-w-sm rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                {state.error}
              </p>
              <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700"
              >
                <FontAwesomeIcon icon={faArrowsRotate} className="h-3.5 w-3.5" />
                Try again
              </button>
            </div>
          )}

          {state.status === "ready" && (
            <iframe
              src={`${state.url}#view=FitH`}
              title={`${kind}: ${subject}`}
              className="h-full w-full border-0"
            />
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline px-4 py-3 sm:px-5">
          {/* Phones render only the first page of an embedded PDF; a tab of
              its own gets the platform viewer. */}
          {state.status === "ready" ? (
            <a
              href={state.url}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-3 w-3" />
              Open in new tab
            </a>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onDownload("csv")}
              disabled={downloading !== null}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
            >
              {downloading === "csv" ? (
                <EcgLoader />
              ) : (
                <FontAwesomeIcon icon={faFileCsv} className="h-3.5 w-3.5 text-gray-500" />
              )}
              Download CSV
            </button>
            <button
              type="button"
              onClick={() => onDownload("pdf")}
              disabled={state.status !== "ready" || downloading !== null}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
            >
              <FontAwesomeIcon icon={faFilePdf} className="h-3.5 w-3.5" />
              Download PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
