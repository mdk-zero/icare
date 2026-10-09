"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faLock,
  faPenToSquare,
  faPercent,
  faPlus,
  faTrashCan,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { type MenuAction } from "../../../components/ActionsMenu";
import ConfirmModal from "../../../components/ConfirmModal";
import { EcgLoader } from "../../../components/EcgLoader";
import { loadingToast } from "../../../components/Toast";
import { saveCourseGrading, type CourseRequirement } from "../../../lib/api";
import { inTopicOrder, requirementNames } from "../../../lib/course-progress";
import {
  GRADING_CHANGED,
  GRADING_ENDED_LOCK,
  GRADING_LIMITS,
  GRADING_NEEDS_MIGRATION,
  settle,
  fileItem,
  isGradeable,
  itemShares,
  leafOf,
  parseGrading,
  presetSplit,
  withItemWeights,
  type GradePart,
  type GradingSplit,
} from "../../../lib/course-grading";
import { isDirty, saveBase, savedDraft, startDraft, type GradingDraft } from "../grading-draft";
import GradingItemPicker from "./grading-item-picker";
import ChecklistSection from "./checklist-section";
import ItemRow from "./requirement-row";

const newId = () => crypto.randomUUID();
const round = (n: number) => Math.round(n * 100) / 100;
const total = (rows: { weight: number }[]) => round(rows.reduce((t, r) => t + (Number.isFinite(r.weight) ? r.weight : 0), 0));

const finite = (n: number) => (Number.isFinite(n) ? n : 0);

/** Part k's colour: the categorical slots the group charts use, led by the brand teal. */
const partColor = (k: number) => `var(--color-group-${(k % 6) + 1})`;
const HATCH = "repeating-linear-gradient(135deg, var(--color-hairline) 0 4px, transparent 4px 8px)";

/**
 * The whole grade as one bar: a segment per part, in the part's colour as in
 * the legend below it, with any share not yet assigned hatched at the end.
 */
function SplitBar({ parts }: { parts: GradePart[] }) {
  const sum = total(parts);
  const described = parts.map((p, k) => `${p.name.trim() || `Part ${k + 1}`} ${finite(p.weight)}%`).join(", ");
  return (
    <div role="img" aria-label={`Grade split: ${described || "nothing yet"}`} className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-subtle">
      {parts.map((p, k) => {
        const weight = Math.max(0, finite(p.weight));
        if (!weight) return null;
        return <div key={p.id} className="h-full" style={{ flex: `${weight} 0 0`, background: partColor(k) }} />;
      })}
      {sum < 100 && <div className="h-full" style={{ flex: `${round(100 - sum)} 0 0`, background: HATCH }} />}
    </div>
  );
}

const inputClass =
  "rounded-lg border border-gray-300 bg-surface px-2.5 py-1.5 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:border-transparent disabled:bg-transparent disabled:px-0";

/**
 * The course's grading split: weighted parts ("Written Exams 30%") with the
 * checklist's items straight under them, each taking a share of its part's
 * percent (even by default, or set per item), and the rest below as not
 * counted. Items are added,
 * edited and removed here, through the page's item form; the split's own
 * edits stay in a draft until saved; the page holds the draft
 * (grading-draft.ts), so it survives a look at another tab. The draft
 * remembers the split it started from, so a save over a newer split is
 * refused rather than undoing it.
 */
export default function GradingTab({
  offeringId,
  requirements,
  grading,
  gradingReady,
  locked,
  state,
  onChange,
  onSaved,
  onNewItem,
  onEditItem,
  onRemoveItem,
}: {
  offeringId: string;
  requirements: CourseRequirement[];
  grading: GradingSplit | null;
  gradingReady: boolean;
  locked: boolean;
  /** The unsaved edits, held by the page. */
  state: GradingDraft;
  onChange: Dispatch<SetStateAction<GradingDraft>>;
  onSaved: () => Promise<void> | void;
  /** Open the item form for a new item counting toward this leaf (null: not counted). */
  onNewItem: (leafId: string | null) => void;
  onEditItem: (requirement: CourseRequirement) => void;
  onRemoveItem: (requirement: CourseRequirement) => void;
}) {
  const { draft } = state;
  const dirty = isDirty(state);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<{ id: string; label: string } | null>(null);
  const [clearing, setClearing] = useState(false);

  const ordered = useMemo(() => inTopicOrder(requirements), [requirements]);
  const names = useMemo(() => {
    const list = requirementNames(ordered);
    return new Map(ordered.map((r, i) => [r.id, list[i]]));
  }, [ordered]);

  const plainActions = (r: CourseRequirement): MenuAction[] => [
    { label: "Edit", icon: faPenToSquare, onClick: () => onEditItem(r) },
    { label: "Remove", icon: faTrashCan, danger: true, onClick: () => onRemoveItem(r) },
  ];
  // With no split to file them under (or before 067), the whole checklist in one list.
  const wholeChecklist = (
    <ChecklistSection
      title="Checklist"
      items={ordered}
      names={names}
      locked={locked}
      onNew={() => onNewItem(null)}
      actionsFor={plainActions}
      empty={
        <>
          <p>No items yet</p>
          {!locked && (
            <button
              type="button"
              onClick={() => onNewItem(null)}
              className="mt-3 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
            >
              <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
              Add the first item
            </button>
          )}
        </>
      }
    />
  );

  // Since 070 the parts are the course's activities, and there is nothing to edit.
  if (grading?.auto) {
    return <AutoGrading split={grading} requirements={ordered} names={names} />;
  }

  if (!gradingReady) {
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-4 w-4 shrink-0" />
          {GRADING_NEEDS_MIGRATION}
        </div>
        {wholeChecklist}
      </div>
    );
  }

  const edit = (next: GradingSplit | null) => {
    onChange((s) => ({ ...s, draft: next }));
    setError(null);
  };
  const discard = () => {
    onChange(startDraft(grading));
    setError(null);
  };

  const save = async (split: GradingSplit | null) => {
    setSaving(true);
    setError(null);
    const progress = loadingToast(split ? "Saving grading split…" : "Clearing grading split…");
    const result = await saveCourseGrading(offeringId, split, saveBase(state, requirements));
    setSaving(false);
    if (result.error !== undefined) {
      progress.error(result.error);
      setError(result.error);
      return false;
    }
    progress.success(split ? "Grading split saved" : "Grading split cleared");
    const saved = result.data.grading;
    onChange((s) => savedDraft(s, saved));
    await onSaved();
    return true;
  };

  if (!draft) {
    return (
      <div className="space-y-4">
        <div className="rounded-xl border border-dashed border-gray-300 bg-surface px-6 py-10 text-center">
          <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600">
            <FontAwesomeIcon icon={faPercent} className="h-5 w-5" />
          </span>
          <h3 className="font-display text-base font-semibold text-gray-900">No grading split yet</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
            {locked
              ? GRADING_ENDED_LOCK
              : "Divide the grade into parts that add up to 100%, then add the items that count toward each. A part's percent is shared among its items."}
          </p>
          {!locked && (
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => edit(presetSplit(newId))}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700"
              >
                Start from Written Exams 30 / Laboratory & Skills 70
              </button>
              <button
                type="button"
                onClick={() => edit({ parts: [{ id: newId(), name: "Part 1", weight: 100, items: [], components: [] }] })}
                className="rounded-lg border border-gray-200 bg-surface px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
              >
                Start blank
              </button>
            </div>
          )}
        </div>
        {wholeChecklist}
      </div>
    );
  }

  const readOnly = locked || saving;
  // Ids no longer on the checklist, or turned into attendance, are dropped, so a stale one can't block saving.
  const parsed = parseGrading(settle(draft, requirements), requirements);
  const problem = parsed.ok ? null : parsed.error;
  const partsTotal = total(draft.parts);

  const setPart = (partId: string, patch: Partial<GradePart>) =>
    edit({ parts: draft.parts.map((p) => (p.id === partId ? { ...p, ...patch } : p)) });
  /** Set one item's share; the others keep what they had (their even share, the first time). */
  const setItemWeight = (part: GradePart, itemId: string, weight: number) =>
    edit({
      parts: draft.parts.map((p) => (p.id === part.id ? withItemWeights(p, { ...itemShares(p), [itemId]: weight }) : p)),
    });
  const splitEvenly = (partId: string) =>
    edit({ parts: draft.parts.map((p) => (p.id === partId ? withItemWeights(p, null) : p)) });
  const removePart = (partId: string) => edit({ parts: draft.parts.filter((p) => p.id !== partId) });
  const addPart = () =>
    edit({
      parts: [...draft.parts, { id: newId(), name: "", weight: Math.max(0, round(100 - partsTotal)), items: [], components: [] }],
    });

  const unfiled = ordered.filter((r) => isGradeable(r) && leafOf(draft, r.id) === null);
  const attendance = ordered.filter((r) => !isGradeable(r));

  const rowActions = (r: CourseRequirement): MenuAction[] => [
    { label: "Edit", icon: faPenToSquare, onClick: () => onEditItem(r) },
    { label: "Stop counting", icon: faXmark, onClick: () => edit(fileItem(draft, r.id, null)) },
    { label: "Remove", icon: faTrashCan, danger: true, onClick: () => onRemoveItem(r) },
  ];

  // A part's items as rows, by kind and then checklist order, each with its share, and the add buttons.
  const leafItems = (leaf: GradePart, label: string) => {
    const filed = new Set(leaf.items);
    const rows = ordered.filter((r) => filed.has(r.id));
    const shares = itemShares(leaf);
    return (
      <div className="min-w-0">
        {rows.length > 0 && (
          <ul className="divide-y divide-hairline">
            {rows.map((r) => (
              <ItemRow
                key={r.id}
                requirement={r}
                name={names.get(r.id) ?? ""}
                trailing={weightField(shares[r.id] ?? NaN, (w) => setItemWeight(leaf, r.id, w), names.get(r.id) ?? "Item", "sm")}
                actions={readOnly ? null : rowActions(r)}
              />
            ))}
          </ul>
        )}
        {readOnly ? (
          rows.length === 0 && <p className="py-1 text-xs text-gray-400">No items yet</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
            <button
              type="button"
              onClick={() => onNewItem(leaf.id)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline"
            >
              <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5" />
              New item
            </button>
            {unfiled.length > 0 && (
              <button
                type="button"
                onClick={() => setPicking({ id: leaf.id, label })}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-500 hover:text-brand-700 hover:underline"
              >
                <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5" />
                Existing item
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  // A percent is a few digits, so its box is sized for "33.33", with the sign inside.
  const weightField = (value: number, onChange: (n: number) => void, label: string, size: "md" | "sm" = "md") =>
    readOnly ? (
      <span className={`font-semibold tabular-nums text-gray-900 ${size === "sm" ? "text-xs" : "text-sm"}`}>{finite(value)}%</span>
    ) : (
      <label
        className={`inline-flex shrink-0 items-center rounded-lg border bg-surface transition-all focus-within:border-brand-600 focus-within:ring-2 focus-within:ring-brand-600/30 ${
          size === "sm" ? "border-gray-200" : "border-gray-300"
        }`}
      >
        <input
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step={0.01}
          value={Number.isFinite(value) ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
          aria-label={`${label} percent`}
          className="w-14 bg-transparent py-1.5 pl-2 text-right text-sm font-semibold tabular-nums text-gray-900 [appearance:textfield] focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
        />
        <span className="select-none pl-0.5 pr-2.5 text-sm text-gray-400">%</span>
      </label>
    );

  const removeButton = (onClick: () => void, label: string) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
    >
      <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
    </button>
  );

  return (
    <div className="space-y-4">
      {locked && (
        <div className="flex items-start gap-2.5 rounded-xl border border-hairline bg-subtle px-4 py-3 text-sm text-gray-600">
          <FontAwesomeIcon icon={faLock} className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          {GRADING_ENDED_LOCK}
        </div>
      )}

      <section className="rounded-xl border border-hairline bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h3 className="font-display text-sm font-semibold text-gray-900">Final grade</h3>
          <span className={`inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums ${partsTotal === 100 ? "text-emerald-700" : "text-amber-700"}`}>
            {partsTotal === 100 ? (
              <>
                <FontAwesomeIcon icon={faCircleCheck} className="h-3.5 w-3.5" />
                100%
              </>
            ) : partsTotal < 100 ? (
              `${partsTotal}% · ${round(100 - partsTotal)}% left to assign`
            ) : (
              `${partsTotal}% · ${round(partsTotal - 100)}% over`
            )}
          </span>
        </div>
        <SplitBar parts={draft.parts} />
        <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
          {draft.parts.map((p, k) => (
            <li key={p.id} className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: partColor(k) }} aria-hidden />
              <span className="truncate text-gray-700">{p.name.trim() || `Part ${k + 1}`}</span>
              <span className="font-semibold tabular-nums text-gray-900">{finite(p.weight)}%</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 border-t border-hairline pt-3 text-xs leading-relaxed text-gray-500">
          Percents are of the final grade. A part&apos;s percent is shared among its items, evenly unless you set an item&apos;s
          percent yourself, and the items must add up to the part. Work with no score yet is left out, so a grade reads as
          the grade so far.
        </p>
      </section>

      {draft.parts.map((part, k) => {
        const partLabel = part.name.trim() || `Part ${k + 1}`;
        const color = partColor(k);
        const shares = itemShares(part);
        const inside = total(part.items.map((id) => ({ weight: shares[id] ?? NaN })));
        const balanced = inside === round(finite(part.weight));
        return (
          <section key={part.id} className="rounded-xl border border-hairline bg-surface">
            <header className="flex items-center gap-2.5 px-4 py-3">
              <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: color }} aria-hidden />
              <input
                value={part.name}
                onChange={(e) => setPart(part.id, { name: e.target.value })}
                maxLength={GRADING_LIMITS.name}
                disabled={readOnly}
                placeholder="Part name, e.g. Written Exams"
                aria-label="Part name"
                className={`${inputClass} min-w-0 flex-1 font-display text-base font-semibold sm:max-w-xs`}
              />
              <div className="ml-auto flex shrink-0 items-center gap-1">
                {weightField(part.weight, (weight) => setPart(part.id, { weight }), partLabel)}
                {!readOnly && removeButton(() => removePart(part.id), `Remove ${partLabel}`)}
              </div>
            </header>

            <div className="border-t border-hairline px-4 py-2 sm:pl-9 sm:pr-[3.25rem]">{leafItems(part, partLabel)}</div>

            {part.items.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-hairline px-4 py-2.5 sm:pr-[3.25rem]">
                <span className="text-xs text-gray-500">
                  {part.item_weights
                    ? "Percents set per item"
                    : `${finite(part.weight)}% shared evenly by ${part.items.length} item${part.items.length === 1 ? "" : "s"}`}
                </span>
                {part.item_weights && !readOnly && (
                  <button
                    type="button"
                    onClick={() => splitEvenly(part.id)}
                    className="text-xs font-semibold text-brand-700 hover:underline"
                  >
                    Split evenly
                  </button>
                )}
                <span
                  className={`ml-auto inline-flex items-center gap-1.5 text-xs tabular-nums ${
                    balanced ? "text-gray-500" : "font-medium text-amber-700"
                  }`}
                >
                  {balanced && <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3 text-emerald-600" />}
                  Items add up to {inside}% of {finite(part.weight)}%
                </span>
              </div>
            )}
          </section>
        );
      })}

      {!readOnly && draft.parts.length < GRADING_LIMITS.parts && (
        <button
          type="button"
          onClick={addPart}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-sm font-medium text-gray-600 transition-colors hover:border-brand-600 hover:bg-brand-50 hover:text-brand-700"
        >
          <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
          Add part
        </button>
      )}

      {(unfiled.length > 0 || attendance.length > 0 || !locked) && (
        <ChecklistSection
          title="Not counted in the grade"
          items={[...unfiled, ...attendance]}
          names={names}
          locked={locked}
          onNew={() => onNewItem(null)}
          actionsFor={plainActions}
          noteFor={(r) => (isGradeable(r) ? undefined : "No score, so it can't count")}
        />
      )}

      {!locked && (
        <div className="sticky -bottom-3 z-10 -mx-1 flex flex-wrap items-center gap-3 rounded-xl border border-hairline bg-surface/95 px-4 py-3 shadow-sm backdrop-blur lg:-bottom-5">
          {error ? (
            <span className="flex min-w-0 flex-1 items-center gap-2 text-sm text-rose-700">
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 shrink-0" />
              {error}
              {error === GRADING_CHANGED && (
                <button
                  type="button"
                  onClick={async () => {
                    discard();
                    await onSaved();
                  }}
                  className="font-semibold underline"
                >
                  Reload
                </button>
              )}
            </span>
          ) : (
            <span className="min-w-0 flex-1 text-sm text-gray-500">
              {problem ? <span className="text-amber-700">{problem}</span> : dirty ? "Unsaved changes" : "Saved"}
            </span>
          )}
          {grading && (
            <button
              type="button"
              onClick={() => setClearing(true)}
              disabled={saving}
              className="text-sm font-medium text-gray-500 hover:text-rose-600 disabled:opacity-50"
            >
              Clear split
            </button>
          )}
          {dirty && (
            <button
              type="button"
              onClick={discard}
              disabled={saving}
              className="rounded-lg border border-gray-200 bg-surface px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
            >
              Discard
            </button>
          )}
          <button
            type="button"
            onClick={() => void save(parsed.ok ? parsed.value : draft)}
            disabled={saving || !dirty || !!problem}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700 disabled:opacity-60"
          >
            {saving && <EcgLoader />}
            Save
          </button>
        </div>
      )}

      {picking && (
        <GradingItemPicker
          leafLabel={picking.label}
          items={unfiled}
          names={names}
          onPick={(id) => edit(fileItem(draft, id, picking.id))}
          onClose={() => setPicking(null)}
        />
      )}
      {clearing && (
        <ConfirmModal
          config={{
            title: "Clear the grading split?",
            message: "Every part goes, and no grade is shown until you set up a new split. Scores and the checklist are not touched.",
            confirmLabel: "Clear split",
            danger: true,
            loading: saving,
            onConfirm: () =>
              void save(null).then((ok) => {
                if (ok) setClearing(false);
              }),
          }}
          onClose={() => setClearing(false)}
        />
      )}
    </div>
  );
}

/** Where each automatic part's items come from, for its empty state. */
const AUTO_SOURCE: Record<string, { href: string; make: string }> = {
  "patient-cases": { href: "/faculty/scenarios/new", make: "Create a patient case" },
  quizzes: { href: "/faculty/assessments/new", make: "Create a quiz" },
  "case-presentations": { href: "/faculty/cases", make: "Create a case presentation" },
};

/**
 * The automatic split (migration 070): the course's Patient Cases, Quizzes
 * and Case Presentations, filed by kind as the instructor makes them for
 * the course. A part's grade is the average of its items and the final
 * grade the average of every item, so nothing here is set by hand.
 */
function AutoGrading({
  split,
  requirements,
  names,
}: {
  split: GradingSplit;
  requirements: CourseRequirement[];
  names: Map<string, string>;
}) {
  return (
    <div className="space-y-4">
      {split.parts.map((p, k) => {
        const filed = new Set(p.items);
        const rows = requirements.filter((r) => filed.has(r.id));
        const source = AUTO_SOURCE[p.id];
        return (
          <section key={p.id} className="rounded-xl border border-hairline bg-surface">
            <header className="flex items-center gap-2.5 px-4 py-3">
              <span className="h-3 w-3 shrink-0 rounded-[4px]" style={{ background: partColor(k) }} aria-hidden />
              <h3 className="font-display text-base font-semibold text-gray-900">{p.name}</h3>
              <span className="ml-auto text-xs tabular-nums text-gray-500">
                average of {rows.length} item{rows.length === 1 ? "" : "s"}
              </span>
            </header>
            <div className="border-t border-hairline px-4 py-2 sm:pl-9">
              {rows.length > 0 ? (
                <ul className="divide-y divide-hairline">
                  {rows.map((r) => (
                    <ItemRow key={r.id} requirement={r} name={names.get(r.id) ?? ""} actions={null} />
                  ))}
                </ul>
              ) : (
                <p className="py-2 text-sm text-gray-500">
                  None yet.{" "}
                  {source && (
                    <a href={source.href} className="font-semibold text-brand-700 hover:underline">
                      {source.make}
                    </a>
                  )}{" "}
                  for this course and it shows up here.
                </p>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
