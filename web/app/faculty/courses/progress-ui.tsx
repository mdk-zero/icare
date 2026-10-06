"use client";

import { useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faUserCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import { setRequirementCheck, type CourseRequirement } from "../../lib/api";
import { requirementDetail, type ItemProgress } from "../../lib/course-progress";
import { EcgLoader } from "../../components/EcgLoader";
import { toast } from "../../components/Toast";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const when = (at: string | null) => (at ? dateFmt.format(new Date(at)) : "");

/** The score a cell shows: the activity's or skill's best, or a count's average. */
function itemScore(item: ItemProgress | undefined): number | null {
  return item ? (item.best_score ?? item.avg_score) : null;
}

/** "best 86%" or "average 78%", for the hover text. */
function scorePhrase(item: ItemProgress): string {
  const score = itemScore(item);
  if (score === null) return "";
  return `${item.best_score !== null ? "best" : "average"} ${Math.round(score)}%`;
}

/** What a cell says when hovered or read aloud. */
export function statusText(requirement: CourseRequirement, item: ItemProgress | undefined): string {
  if (!item) return "Not started";
  const score = scorePhrase(item);
  if (item.done && item.source === "instructor") {
    return requirement.kind === "manual"
      ? `Ticked by you on ${when(item.done_at)}${item.note ? `: ${item.note}` : ""}`
      : `Marked done by you on ${when(item.done_at)}${item.note ? `: ${item.note}` : ""}${score ? ` · graded work ${score}` : ""}`;
  }
  if (item.done) {
    if (requirement.kind === "count" && requirement.activity_type === "shift") return `Met on ${when(item.done_at)} · ${item.current} attended`;
    return `Met on ${when(item.done_at)}${score ? ` · ${score}` : ""}`;
  }
  if (requirement.kind === "count") return `${item.current} of ${item.target} so far${score ? ` · ${score}` : ""}`;
  if (requirement.kind === "skill" && item.best_score !== null) return `Best so far: ${Math.round(item.best_score)}% (${item.level}), below the minimum`;
  if (item.best_score !== null) return `Best so far: ${Math.round(item.best_score)}%, below the minimum`;
  return requirement.kind === "manual" ? "Not ticked" : "Not met yet";
}

const PILL = "inline-flex h-7 min-w-7 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-semibold";

/**
 * One student's standing on one item: their score (green once met, amber
 * below it), a shift count, a violet mark for your ticks, or an empty ring.
 */
export function ItemStatus({ requirement, item }: { requirement: CourseRequirement; item: ItemProgress | undefined }) {
  const score = itemScore(item);
  const scoreText = score === null ? null : `${Math.round(score)}%`;
  // Only items with no score (shifts) show a count.
  const count = requirement.kind === "count" && item ? `${item.current}/${item.target}` : null;

  if (item?.done && item.source === "instructor") {
    return (
      <span className={`${PILL} bg-violet-100 text-violet-700`}>
        <FontAwesomeIcon icon={faUserCheck} className="h-3 w-3" />
        {requirement.kind !== "manual" && scoreText}
      </span>
    );
  }
  if (item?.done) {
    return (
      <span className={`${PILL} bg-emerald-100 text-emerald-700`}>
        {scoreText ?? count ?? <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" />}
      </span>
    );
  }
  if (scoreText || (count && item && item.current > 0)) {
    return (
      <span className={`${PILL} bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20`}>{scoreText ?? count}</span>
    );
  }
  return <span className="inline-block h-7 w-7 rounded-full border-2 border-dashed border-gray-200" />;
}

/** Whether clicking does anything: graded work can't be unticked. */
export function canAct(requirement: CourseRequirement, item: ItemProgress | undefined): boolean {
  if (requirement.kind === "manual") return true;
  return !item?.done || item.source === "instructor";
}

type Pending = {
  offeringId: string;
  student: { id: string; name: string };
  requirement: CourseRequirement;
  /** "Quiz #2" (requirementNames). */
  name: string;
  item: ItemProgress | undefined;
};

/**
 * Ticking from the progress views. A manual item toggles straight away. An
 * automatic item asks first: marking it done needs a note (work the system
 * cannot see), and removing the mark needs a confirmation.
 */
export function useTicks(onSaved: (studentId: string, requirementId: string, item: ItemProgress) => void): {
  act: (
    offeringId: string,
    student: { id: string; name: string },
    requirement: CourseRequirement,
    name: string,
    item: ItemProgress | undefined,
  ) => void;
  busy: string | null;
  dialog: ReactNode;
} {
  const [busy, setBusy] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const send = async (p: Pending, checked: boolean, note?: string) => {
    const key = `${p.student.id}:${p.requirement.id}`;
    setBusy(key);
    const result = await setRequirementCheck(p.offeringId, p.requirement.id, { student_id: p.student.id, checked, note });
    setBusy(null);
    if (result.error !== undefined) {
      toast(result.error, "error");
      return false;
    }
    onSaved(p.student.id, p.requirement.id, result.data.progress);
    return true;
  };

  const act: ReturnType<typeof useTicks>["act"] = (offeringId, student, requirement, name, item) => {
    if (!canAct(requirement, item)) return;
    const p = { offeringId, student, requirement, name, item };
    if (requirement.kind === "manual") void send(p, !item?.done);
    else setPending(p);
  };

  const dialog = pending ? (
    <MarkDoneDialog
      pending={pending}
      onClose={() => setPending(null)}
      onSubmit={async (checked, note) => {
        if (await send(pending, checked, note)) setPending(null);
      }}
      saving={busy !== null}
    />
  ) : null;

  return { act, busy, dialog };
}

function MarkDoneDialog({
  pending,
  onClose,
  onSubmit,
  saving,
}: {
  pending: Pending;
  onClose: () => void;
  onSubmit: (checked: boolean, note?: string) => Promise<void>;
  saving: boolean;
}) {
  const removing = pending.item?.done === true;
  const [note, setNote] = useState("");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={saving ? undefined : onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline bg-subtle px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-violet-100">
              <FontAwesomeIcon icon={faUserCheck} className="h-5 w-5 text-violet-700" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-display text-lg font-semibold text-gray-900">
                {removing ? "Remove your mark?" : "Mark as done"}
              </h2>
              <p className="truncate text-sm text-gray-500">{pending.student.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>
        <form
          className="space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit(!removing, removing ? undefined : note.trim());
          }}
        >
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{pending.name}</span>
            <span className="block text-gray-500">{requirementDetail(pending.requirement)}</span>
          </p>
          {removing ? (
            <p className="text-sm text-gray-600">
              {`You marked this done${pending.item?.note ? ` ("${pending.item.note}")` : ""}. Removing the mark leaves it to graded work again.`}
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-600">
                This item normally ticks itself from graded work. Mark it done when the student met it some other way, such
                as a Quiz taken on paper.
              </p>
              <div>
                <label htmlFor="mark-note" className="mb-1.5 block text-sm font-semibold text-gray-700">
                  Why it is done <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="mark-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={3}
                  autoFocus
                  disabled={saving}
                  placeholder="Took the vital signs quiz on paper on Sept 12; scored 82%."
                  className="w-full resize-y rounded-xl border border-gray-300 bg-surface px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                />
              </div>
            </>
          )}
          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-200 bg-surface px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || (!removing && !note.trim())}
              className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition-all disabled:opacity-60 ${
                removing ? "bg-rose-600 hover:bg-rose-700" : "bg-brand-600 hover:bg-brand-700"
              }`}
            >
              {saving && <EcgLoader />}
              {removing ? "Remove mark" : "Mark done"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
