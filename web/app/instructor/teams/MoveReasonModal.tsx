"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faTimes } from "@fortawesome/free-solid-svg-icons";

/** Matches the route: long enough that "x" isn't a reason. */
const MIN_REASON = 10;
const MAX_REASON = 500;

/**
 * Asks an instructor why students who are already in a group are moving to
 * another of theirs. The server requires the reason, keeps it in the audit
 * trail and sends it to the Dean.
 */
export default function MoveReasonModal({
  names,
  to,
  onClose,
  onConfirm,
}: {
  names: string[];
  /** The group they are moving to. */
  to: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const trimmed = reason.trim();
  const blocker = trimmed.length < MIN_REASON ? `Give a reason of at least ${MIN_REASON} characters` : null;
  const who = names.length === 1 ? names[0] : `${names.length} students`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-reason-title"
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-hairline bg-subtle p-4">
          <div className="min-w-0">
            <h2 id="move-reason-title" className="truncate text-lg font-bold text-gray-900">
              Move {who} to {to}
            </h2>
            <p className="text-sm text-gray-500">They are in a group already, so the move needs a reason.</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 transition-colors hover:bg-gray-200" aria-label="Close">
            <FontAwesomeIcon icon={faTimes} className="h-5 w-5 text-gray-500" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <label className="block">
            <span className="text-sm font-bold text-gray-900">Why does {names.length === 1 ? "this student" : "each student"} need to move?</span>
            <span className="mb-2 block text-xs text-gray-500">
              Required. Your Dean or Program Chair receives this with a notice of the move, and it is kept in the audit trail.
            </span>
            <textarea
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, MAX_REASON))}
              rows={4}
              placeholder="e.g. Balancing the groups after a transfer; conflicting clinical schedule with Group A"
              className="w-full resize-y rounded-xl border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
            />
            <span
              className={`mt-1 block text-right text-[11px] tabular-nums ${
                trimmed.length > 0 && trimmed.length < MIN_REASON ? "text-amber-600" : "text-gray-400"
              }`}
            >
              {trimmed.length < MIN_REASON
                ? `${MIN_REASON - trimmed.length} more characters needed`
                : `${reason.length}/${MAX_REASON}`}
            </span>
          </label>
          <p className="rounded-xl border border-hairline bg-subtle px-3 py-2 text-xs text-gray-600">
            Cases already given stay with {names.length === 1 ? "the student" : "them"}. They won&apos;t get {to}&apos;s case
            until you assign it to the group again.
          </p>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-hairline bg-subtle p-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(trimmed)}
            disabled={blocker !== null}
            title={blocker ?? undefined}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            Move to {to}
            <FontAwesomeIcon icon={faArrowRight} className="h-3 w-3" />
          </button>
        </footer>
      </div>
    </div>
  );
}
