"use client";

import { useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck, faTrashCan, faUserCheck, faXmark } from "@fortawesome/free-solid-svg-icons";
import {
  addRequirementScore,
  removeRequirementScore,
  setRequirementCheck,
  type CourseRequirement,
} from "../../lib/api";
import {
  MAX_SCORE_NOTE,
  canEnterScore,
  entryMode,
  parseScore,
  requirementDetail,
  scoreBlock,
  type ItemProgress,
  type ScoreEntry,
} from "../../lib/course-progress";
import { EcgLoader } from "../../components/EcgLoader";
import { toast } from "../../components/Toast";
import { topicOf } from "./topics";

const dateFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
const when = (at: string | null) => (at ? dateFmt.format(new Date(at)) : "");
const pct = (score: number) => `${Math.round(score * 100) / 100}%`;

/** A cached response from before entered scores (066) has no entries. */
const entriesOf = (item: ItemProgress | undefined): ScoreEntry[] => item?.entries ?? [];

/** The score a cell shows: the activity's or skill's best, or a count's average. */
function itemScore(item: ItemProgress | undefined): number | null {
  return item ? (item.best_score ?? item.avg_score) : null;
}

/** "best 86% (Satisfactory)", "average 78%", or a Lab Activity's "88%", for the hover text. */
function scorePhrase(requirement: CourseRequirement, item: ItemProgress): string {
  const score = itemScore(item);
  if (score === null) return "";
  const kind = requirement.kind === "manual" ? "" : item.best_score !== null ? "best " : "average ";
  return `${kind}${Math.round(score)}%${item.level ? ` (${item.level})` : ""}`;
}

/** What a cell says when hovered or read aloud. */
export function statusText(requirement: CourseRequirement, item: ItemProgress | undefined): string {
  if (!item) return "Not started";
  const attendance = entryMode(requirement) === "mark";
  const parts: string[] = [];
  if (item.done) parts.push(`Met on ${when(item.done_at)}`);
  else if (requirement.kind === "count") parts.push(`${item.current} of ${item.target} so far`);
  else if (item.best_score !== null) parts.push(`Best so far: ${Math.round(item.best_score)}%${item.level ? ` (${item.level})` : ""}, below the minimum`);
  else parts.push(requirement.kind === "manual" ? "No score yet" : "Not met yet");
  if (item.done && attendance) parts.push(`${item.current} attended`);
  if (item.done || requirement.kind === "count") {
    const score = scorePhrase(requirement, item);
    if (score) parts.push(score);
  }
  const entries = entriesOf(item);
  if (entries.length > 0) parts.push(requirement.kind === "count" ? `${entries.length} entered by you` : "entered by you");
  if (item.marked) parts.push(`${requirement.kind === "manual" ? "ticked" : "marked done"} by you${item.note ? `: ${item.note}` : ""}`);
  return parts.join(" · ");
}

const PILL = "inline-flex h-7 min-w-7 items-center justify-center gap-1 whitespace-nowrap rounded-full px-2 text-[11px] font-semibold";

/**
 * One student's standing on one item: their score (green once met by graded
 * work, violet when met by a score or mark of yours, amber below it), an attendance
 * count, or an empty ring.
 */
export function ItemStatus({ requirement, item }: { requirement: CourseRequirement; item: ItemProgress | undefined }) {
  const score = itemScore(item);
  const scoreText = score === null ? null : `${Math.round(score)}%`;
  // Only items with no score (attendance) show a count.
  const count = requirement.kind === "count" && item ? `${item.current}/${item.target}` : null;

  if (item?.done && item.source === "instructor") {
    return (
      <span className={`${PILL} bg-violet-100 text-violet-700`}>
        <FontAwesomeIcon icon={faUserCheck} className="h-3 w-3" />
        {scoreText}
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
  // No grade yet: a dash, as the Performance tab shows it.
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center text-sm text-gray-300" aria-label="No grade yet">
      —
    </span>
  );
}

/**
 * Whether clicking does anything: entering a score where the student has no
 * grade, marking attendance done, or removing a score or mark of yours.
 * Graded work can't be changed here.
 */
export function canAct(requirement: CourseRequirement, item: ItemProgress | undefined): boolean {
  if (entriesOf(item).length > 0 || item?.marked) return true;
  if (entryMode(requirement) === "mark") return !item?.done;
  return canEnterScore(requirement, item);
}

/** The button's words on the student page. */
export function actionLabel(requirement: CourseRequirement, item: ItemProgress | undefined): string {
  if (entryMode(requirement) === "mark") return item?.marked ? "Remove mark" : "Mark done";
  const entries = entriesOf(item);
  if (canEnterScore(requirement, item)) {
    if (requirement.kind === "count") return "Add score";
    return entries.length > 0 ? "Edit score" : "Enter score";
  }
  return entries.length > 0 ? "Edit scores" : "Remove mark";
}

type Pending = {
  offeringId: string;
  student: { id: string; name: string };
  requirement: CourseRequirement;
  /** "Quiz #2" (requirementNames). */
  name: string;
  item: ItemProgress | undefined;
};

type Change =
  | { type: "score"; score: number; note: string }
  | { type: "remove-score"; id: string }
  | { type: "mark"; note: string }
  | { type: "remove-mark" };

/**
 * Filling items in from the progress views. Clicking a cell opens a dialog:
 * enter the score the student earned on work the app has no grade for, mark
 * attendance done with a note, or remove a score or mark of yours.
 */
export function useEntryDialog(onSaved: (studentId: string, requirementId: string, item: ItemProgress) => void): {
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

  const send = async (p: Pending, change: Change) => {
    const { offeringId, student, requirement } = p;
    setBusy(`${student.id}:${requirement.id}`);
    const result =
      change.type === "score"
        ? await addRequirementScore(offeringId, requirement.id, { student_id: student.id, score: change.score, note: change.note })
        : change.type === "remove-score"
          ? await removeRequirementScore(offeringId, requirement.id, change.id)
          : await setRequirementCheck(offeringId, requirement.id, {
              student_id: student.id,
              checked: change.type === "mark",
              note: change.type === "mark" ? change.note : undefined,
            });
    setBusy(null);
    if (result.error !== undefined) {
      toast(result.error, "error");
      return;
    }
    onSaved(student.id, requirement.id, result.data.progress);
    if (change.type === "score" || change.type === "mark") {
      toast(change.type === "score" ? "Score saved" : "Marked done");
      setPending(null);
    } else {
      // Stay open on what is left, so several scores can be removed in a row.
      setPending({ ...p, item: result.data.progress });
    }
  };

  const act: ReturnType<typeof useEntryDialog>["act"] = (offeringId, student, requirement, name, item) => {
    if (canAct(requirement, item)) setPending({ offeringId, student, requirement, name, item });
  };

  const dialog = pending ? (
    <EntryDialog
      // Fresh fields once a score or mark is removed.
      key={`${pending.student.id}:${pending.requirement.id}:${entriesOf(pending.item).map((e) => e.id).join(",")}:${pending.item?.marked}`}
      pending={pending}
      onClose={() => setPending(null)}
      onChange={(change) => void send(pending, change)}
      saving={busy !== null}
    />
  ) : null;

  return { act, busy, dialog };
}

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-surface px-3.5 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30";

/** What an entered score does on this item, under the score field. */
function scoreHint(requirement: CourseRequirement, item: ItemProgress | undefined): string {
  const min = requirement.min_score;
  const meets = min === null ? "" : ` It is met at ${Number(min)}% or more.`;
  switch (requirement.kind) {
    case "manual":
      return entriesOf(item).length > 0 ? "Replaces the score you entered before." : "The student's score on this lab activity.";
    case "count":
      return `Counts as one more piece of work toward “${requirement.label}” and joins the average.${min === null ? "" : ` Only scores of ${Number(min)}% or more count toward the total.`}`;
    case "skill":
      return `The student has no graded work on this skill yet.${meets}`;
    default:
      return `The student has no grade on this yet.${meets}`;
  }
}

function EntryDialog({
  pending,
  onClose,
  onChange,
  saving,
}: {
  pending: Pending;
  onClose: () => void;
  onChange: (change: Change) => void;
  saving: boolean;
}) {
  const { requirement, item } = pending;
  const mode = entryMode(requirement);
  const entries = entriesOf(item);
  const single = requirement.kind !== "count";
  const canScore = mode === "score" && canEnterScore(requirement, item);
  const canMark = mode === "mark" && !item?.done;
  // A single item's score is edited in place.
  const [score, setScore] = useState(single && entries[0] ? String(entries[0].score) : "");
  const [note, setNote] = useState(single && entries[0] ? entries[0].note : "");
  const parsed = parseScore(score.trim() === "" ? NaN : Number(score));
  const blocked = mode === "score" && !canScore ? scoreBlock(requirement, item) : null;

  const title =
    mode === "mark"
      ? canMark
        ? "Mark as done"
        : "Your mark"
      : !canScore
        ? "Your scores"
        : !single
          ? "Add a score"
          : entries.length > 0
            ? "Edit score"
            : "Enter a score";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={saving ? undefined : onClose}>
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline bg-subtle px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${topicOf(requirement).tile}`}>
              <FontAwesomeIcon icon={topicOf(requirement).icon} className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-display text-lg font-semibold text-gray-900">{title}</h2>
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
            if (canScore && parsed !== null) onChange({ type: "score", score: parsed, note: note.trim() });
            else if (canMark && note.trim()) onChange({ type: "mark", note: note.trim() });
          }}
        >
          <div className="text-sm">
            <p className="font-semibold text-gray-800">{pending.name}</p>
            <p className="text-gray-500">{requirementDetail(requirement)}</p>
            <p className="mt-1 text-xs text-gray-400">{statusText(requirement, item)}</p>
          </div>

          {(entries.length > 0 || item?.marked) && (
            <ul className="divide-y divide-hairline rounded-xl border border-hairline">
              {entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 px-3 py-2">
                  <span className={`${PILL} bg-violet-100 text-violet-700`}>{pct(e.score)}</span>
                  <div className="min-w-0 flex-1 text-xs text-gray-500">
                    <p>Entered by you on {when(e.entered_at)}</p>
                    {e.note && <p className="truncate text-gray-700">{e.note}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange({ type: "remove-score", id: e.id })}
                    disabled={saving}
                    aria-label={`Remove the ${pct(e.score)} score`}
                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                  >
                    <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
              {item?.marked && (
                <li className="flex items-center gap-3 px-3 py-2">
                  <span className={`${PILL} bg-violet-100 text-violet-700`}>
                    <FontAwesomeIcon icon={faUserCheck} className="h-3 w-3" />
                  </span>
                  <div className="min-w-0 flex-1 text-xs text-gray-500">
                    <p>{requirement.kind === "manual" ? "Ticked" : "Marked done"} by you on {when(item.done_at)}</p>
                    {item.note && <p className="truncate text-gray-700">{item.note}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => onChange({ type: "remove-mark" })}
                    disabled={saving}
                    aria-label="Remove your mark"
                    className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                  >
                    <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
                  </button>
                </li>
              )}
            </ul>
          )}

          {canScore && (
            <>
              <div>
                <label htmlFor="entry-score" className="mb-1.5 block text-sm font-semibold text-gray-700">
                  Score <span className="text-rose-500">*</span>
                </label>
                <div className="relative w-36">
                  <input
                    id="entry-score"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={100}
                    step="any"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    autoFocus
                    disabled={saving}
                    placeholder="85"
                    className={`${inputClass} pr-9`}
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm text-gray-400">%</span>
                </div>
                <p className="mt-1.5 text-xs text-gray-500">{scoreHint(requirement, item)}</p>
                {score.trim() !== "" && parsed === null && <p className="mt-1 text-xs text-rose-600">Enter a number from 0 to 100.</p>}
              </div>
              <div>
                <label htmlFor="entry-note" className="mb-1.5 block text-sm font-semibold text-gray-700">
                  Note (optional)
                </label>
                <textarea
                  id="entry-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={MAX_SCORE_NOTE}
                  rows={2}
                  disabled={saving}
                  placeholder="Took the vital signs quiz on paper on Sept 12."
                  className={`${inputClass} resize-y`}
                />
              </div>
            </>
          )}

          {canMark && (
            <>
              <p className="text-sm text-gray-600">
                Attendance is counted from activities done by their deadline. Mark it done when the student met it some
                other way, such as a make-up activity.
              </p>
              <div>
                <label htmlFor="entry-note" className="mb-1.5 block text-sm font-semibold text-gray-700">
                  Why it is done <span className="text-rose-500">*</span>
                </label>
                <textarea
                  id="entry-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={MAX_SCORE_NOTE}
                  rows={3}
                  autoFocus
                  disabled={saving}
                  placeholder="Made up the missed duty on Sept 20."
                  className={`${inputClass} resize-y`}
                />
              </div>
            </>
          )}

          {blocked && <p className="text-sm text-gray-500">{blocked}.</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-200 bg-surface px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
            >
              {canScore || canMark ? "Cancel" : "Close"}
            </button>
            {(canScore || canMark) && (
              <button
                type="submit"
                disabled={saving || (canScore ? parsed === null : !note.trim())}
                className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white transition-all hover:bg-brand-700 disabled:opacity-60"
              >
                {saving && <EcgLoader />}
                {canScore ? "Save score" : "Mark done"}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
