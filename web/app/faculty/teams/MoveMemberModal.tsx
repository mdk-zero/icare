"use client";

import { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowRight, faTimes } from "@fortawesome/free-solid-svg-icons";
import { moveOwnGroupMember, type FacultyTeam } from "../../lib/api";
import Avatar from "../../components/Avatar";
import { toast } from "../../components/Toast";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Matches the route: long enough that "x" isn't a reason. */
const MIN_REASON = 10;
const MAX_REASON = 500;

/**
 * Moves one student to another group this instructor supervises in the same
 * section. The system asks why before it moves anyone; the reason is kept in
 * the audit trail and sent to the instructor's dean.
 */
export default function MoveMemberModal({
  member,
  from,
  groups,
  onClose,
  onMoved,
}: {
  member: FacultyTeam["members"][number];
  from: FacultyTeam;
  /** The other groups the instructor supervises in this section. */
  groups: FacultyTeam[];
  onClose: () => void;
  onMoved: () => void | Promise<void>;
}) {
  const [to, setTo] = useState<string | null>(groups.length === 1 ? groups[0].id : null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const trimmed = reason.trim();
  const target = groups.find((g) => g.id === to) ?? null;
  const blocker = !target
    ? "Choose a group first"
    : trimmed.length < MIN_REASON
      ? `Give a reason of at least ${MIN_REASON} characters`
      : null;

  const move = async () => {
    if (blocker || !target) return;
    setBusy(true);
    const result = await moveOwnGroupMember(member.id, target.id, trimmed);
    if ("error" in result) {
      setBusy(false);
      setError(result.error);
      return;
    }
    await onMoved();
    toast(`Moved ${member.name} to ${target.name}. Your dean has been told why.`);
    onClose();
  };

  const inputClass =
    "w-full rounded-xl border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="move-member-title"
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
      >
        <header className="flex items-start justify-between gap-3 border-b border-hairline bg-subtle p-4">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar name={member.name} src={member.picture_url} userId={member.id} sex={member.sex} size="md" />
            <div className="min-w-0">
              <h2 id="move-member-title" className="truncate text-lg font-bold text-gray-900">
                Move {member.name}
              </h2>
              <p className="text-sm text-gray-500">Currently in {from.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 transition-colors hover:bg-gray-200" aria-label="Close">
            <FontAwesomeIcon icon={faTimes} className="h-5 w-5 text-gray-500" />
          </button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <fieldset>
            <legend className="mb-2 text-sm font-bold text-gray-900">Move to</legend>
            <ul className="divide-y divide-hairline rounded-xl border border-hairline">
              {groups.map((g) => (
                <li key={g.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-subtle">
                    <input
                      type="radio"
                      name="move-to"
                      checked={to === g.id}
                      onChange={() => {
                        setTo(g.id);
                        setError(null);
                      }}
                      className="h-4 w-4 text-brand-600"
                    />
                    <span className="flex-1 text-sm font-medium text-gray-800">{g.name}</span>
                    <span className="text-xs text-gray-500">{plural(g.members.length, "student")}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>

          <label className="block">
            <span className="text-sm font-bold text-gray-900">Why does this student need to move?</span>
            <span className="mb-2 block text-xs text-gray-500">
              Required. Your dean receives this with a notice of the move, and it is kept in the audit trail.
            </span>
            <textarea
              value={reason}
              onChange={(e) => {
                setReason(e.target.value.slice(0, MAX_REASON));
                setError(null);
              }}
              rows={4}
              placeholder="e.g. Balancing the groups after a transfer; conflicting clinical schedule with Group A"
              className={inputClass + " resize-y"}
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

          {target && (
            <p className="rounded-xl border border-hairline bg-subtle px-3 py-2 text-xs text-gray-600">
              Cases already given to {member.name} stay with them. They won&apos;t get {target.name}&apos;s case
              until you assign it to the group again.
            </p>
          )}

          {error && (
            <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-hairline bg-subtle p-4">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={move}
            disabled={busy || blocker !== null}
            title={blocker ?? undefined}
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Moving…" : target ? `Move to ${target.name}` : "Move"}
            {!busy && <FontAwesomeIcon icon={faArrowRight} className="h-3 w-3" />}
          </button>
        </footer>
      </div>
    </div>
  );
}
