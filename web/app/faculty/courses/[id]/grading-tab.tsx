"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCircleCheck,
  faLock,
  faPercent,
  faPlus,
  faTrashCan,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import ConfirmModal from "../../../components/ConfirmModal";
import { EcgLoader } from "../../../components/EcgLoader";
import { loadingToast } from "../../../components/Toast";
import { saveCourseGrading, type CourseRequirement } from "../../../lib/api";
import { inTopicOrder, requirementDetail, requirementNames, topicKey } from "../../../lib/course-progress";
import {
  GRADING_CHANGED,
  GRADING_ENDED_LOCK,
  GRADING_LIMITS,
  GRADING_NEEDS_MIGRATION,
  addComponent,
  dropUnknown,
  fileItem,
  isGradeable,
  leafOf,
  parseGrading,
  presetSplit,
  type GradeComponent,
  type GradePart,
  type GradingSplit,
} from "../../../lib/course-grading";
import { TOPICS } from "../topics";
import { isDirty, savedDraft, startDraft, type GradingDraft } from "../grading-draft";
import GradingItemPicker from "./grading-item-picker";

const newId = () => crypto.randomUUID();
const round = (n: number) => Math.round(n * 100) / 100;
const total = (rows: { weight: number }[]) => round(rows.reduce((t, r) => t + (Number.isFinite(r.weight) ? r.weight : 0), 0));

const inputClass =
  "rounded-lg border border-gray-300 bg-surface px-2.5 py-1.5 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:border-transparent disabled:bg-transparent disabled:px-0";

/**
 * The course's grading split: weighted parts ("Written Exams 30%") and,
 * inside a part, components ("Midterm 15%"), with checklist items filed
 * under them. Edits stay in a draft until saved; the page holds the draft
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
  const byId = useMemo(() => new Map(requirements.map((r) => [r.id, r])), [requirements]);

  if (!gradingReady) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-4 w-4 shrink-0" />
        {GRADING_NEEDS_MIGRATION}
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
    const result = await saveCourseGrading(offeringId, split, state.base);
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
      <div className="rounded-xl border border-dashed border-gray-300 bg-surface px-6 py-10 text-center">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600">
          <FontAwesomeIcon icon={faPercent} className="h-5 w-5" />
        </span>
        <h3 className="font-display text-base font-semibold text-gray-900">No grading split yet</h3>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
          {locked
            ? GRADING_ENDED_LOCK
            : "Divide the grade into parts that add up to 100%, split them further if you like, and choose which checklist items count toward each."}
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
    );
  }

  const readOnly = locked || saving;
  // Ids no longer on the checklist are dropped, so a stale one can't block saving.
  const parsed = parseGrading(dropUnknown(draft, requirements), requirements);
  const problem = parsed.ok ? null : parsed.error;
  const partsTotal = total(draft.parts);

  const setPart = (partId: string, patch: Partial<GradePart>) =>
    edit({ parts: draft.parts.map((p) => (p.id === partId ? { ...p, ...patch } : p)) });
  const setComponent = (partId: string, componentId: string, patch: Partial<GradeComponent>) =>
    edit({
      parts: draft.parts.map((p) =>
        p.id === partId ? { ...p, components: p.components.map((c) => (c.id === componentId ? { ...c, ...patch } : c)) } : p,
      ),
    });
  const removePart = (partId: string) => edit({ parts: draft.parts.filter((p) => p.id !== partId) });
  const removeComponent = (partId: string, componentId: string) =>
    edit({ parts: draft.parts.map((p) => (p.id === partId ? { ...p, components: p.components.filter((c) => c.id !== componentId) } : p)) });
  const addPart = () =>
    edit({
      parts: [...draft.parts, { id: newId(), name: "", weight: Math.max(0, round(100 - partsTotal)), items: [], components: [] }],
    });
  // A new component takes what is left of its part's share: all of it for the first.
  const addComponentTo = (part: GradePart) =>
    edit(
      addComponent(draft, part.id, {
        id: newId(),
        name: "",
        weight: Math.max(0, round(part.weight - total(part.components))),
        items: [],
      }),
    );

  const unfiled = ordered.filter((r) => isGradeable(r) && leafOf(draft, r.id) === null);
  const attendance = ordered.filter((r) => !isGradeable(r));

  const chips = (leaf: GradeComponent, label: string) => (
    <div className="flex flex-wrap items-center gap-1.5">
      {leaf.items
        .map((id) => byId.get(id))
        .filter((r): r is CourseRequirement => !!r)
        .map((r) => {
          const topic = TOPICS[topicKey(r)];
          return (
            <span
              key={r.id}
              title={requirementDetail(r)}
              className={`inline-flex items-center gap-1.5 rounded-full border border-hairline bg-subtle py-0.5 pl-1 pr-2 text-xs font-medium ${topic.text}`}
            >
              <span className={`flex h-4 w-4 items-center justify-center rounded-full ${topic.tile}`}>
                <FontAwesomeIcon icon={topic.icon} className="h-2 w-2" />
              </span>
              {names.get(r.id)}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => edit(fileItem(draft, r.id, null))}
                  aria-label={`Stop counting ${names.get(r.id)} toward ${label}`}
                  className="-mr-1 rounded-full p-0.5 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                >
                  <FontAwesomeIcon icon={faXmark} className="h-2.5 w-2.5" />
                </button>
              )}
            </span>
          );
        })}
      {!readOnly && (
        <button
          type="button"
          onClick={() => setPicking({ id: leaf.id, label })}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-gray-300 px-2 py-0.5 text-xs font-medium text-gray-500 transition-colors hover:border-brand-600 hover:text-brand-700"
        >
          <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5" />
          Add items
        </button>
      )}
      {readOnly && leaf.items.length === 0 && <span className="text-xs text-gray-400">No items</span>}
    </div>
  );

  const weightInput = (value: number, onChange: (n: number) => void, label: string) => (
    <label className="flex shrink-0 items-center gap-1 text-sm text-gray-500">
      <input
        type="number"
        min={0}
        max={100}
        step={0.01}
        value={Number.isFinite(value) ? value : ""}
        onChange={(e) => onChange(e.target.value === "" ? NaN : Number(e.target.value))}
        disabled={readOnly}
        aria-label={`${label} percent`}
        className={`${inputClass} w-20 text-right font-semibold`}
      />
      %
    </label>
  );

  return (
    <div className="space-y-4">
      {locked && (
        <div className="flex items-start gap-2.5 rounded-xl border border-hairline bg-subtle px-4 py-3 text-sm text-gray-600">
          <FontAwesomeIcon icon={faLock} className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          {GRADING_ENDED_LOCK}
        </div>
      )}

      <p className="text-sm text-gray-500">
        Percents are of the final grade: a part&apos;s components add up to the part. Each component averages the items in it,
        and work with no score yet is left out, so the grade reads as the grade so far.
      </p>

      {draft.parts.map((part, k) => {
        const inside = total(part.components);
        const partLabel = part.name.trim() || `Part ${k + 1}`;
        return (
          <section key={part.id} className="overflow-hidden rounded-xl border border-hairline bg-surface">
            <div className="flex flex-wrap items-center gap-3 border-b border-hairline bg-subtle px-4 py-3">
              <input
                value={part.name}
                onChange={(e) => setPart(part.id, { name: e.target.value })}
                maxLength={GRADING_LIMITS.name}
                disabled={readOnly}
                placeholder="Part name, e.g. Written Exams"
                aria-label="Part name"
                className={`${inputClass} min-w-0 flex-1 font-display font-semibold`}
              />
              {weightInput(part.weight, (weight) => setPart(part.id, { weight }), partLabel)}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => removePart(part.id)}
                  aria-label={`Remove ${partLabel}`}
                  className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                >
                  <FontAwesomeIcon icon={faTrashCan} className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="space-y-2 px-4 py-3">
              {part.components.length === 0 ? (
                chips(part, partLabel)
              ) : (
                <>
                  {part.components.map((c, j) => {
                    const label = `${partLabel} › ${c.name.trim() || `Component ${j + 1}`}`;
                    return (
                      <div key={c.id} className="rounded-lg border border-hairline px-3 py-2.5">
                        <div className="mb-2 flex items-center gap-3">
                          <input
                            value={c.name}
                            onChange={(e) => setComponent(part.id, c.id, { name: e.target.value })}
                            maxLength={GRADING_LIMITS.name}
                            disabled={readOnly}
                            placeholder="Component, e.g. Midterm"
                            aria-label="Component name"
                            className={`${inputClass} min-w-0 flex-1 font-medium`}
                          />
                          {weightInput(c.weight, (weight) => setComponent(part.id, c.id, { weight }), label)}
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => removeComponent(part.id, c.id)}
                              aria-label={`Remove ${label}`}
                              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                            >
                              <FontAwesomeIcon icon={faTrashCan} className="h-3 w-3" />
                            </button>
                          )}
                        </div>
                        {chips(c, label)}
                      </div>
                    );
                  })}
                  <p className={`text-xs ${inside === round(part.weight) ? "text-gray-500" : "font-medium text-amber-700"}`}>
                    Components add up to {inside}% of {Number.isFinite(part.weight) ? part.weight : 0}%
                  </p>
                </>
              )}
              {!readOnly && part.components.length < GRADING_LIMITS.components && (
                <button
                  type="button"
                  onClick={() => addComponentTo(part)}
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline"
                >
                  <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5" />
                  {part.components.length === 0 ? "Split into components" : "Add component"}
                </button>
              )}
            </div>
          </section>
        );
      })}

      <div className="flex flex-wrap items-center gap-3">
        {!readOnly && draft.parts.length < GRADING_LIMITS.parts && (
          <button
            type="button"
            onClick={addPart}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:border-brand-600 hover:text-brand-700"
          >
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
            Add part
          </button>
        )}
        <span
          className={`ml-auto inline-flex items-center gap-1.5 text-sm font-semibold ${
            partsTotal === 100 ? "text-emerald-700" : "text-amber-700"
          }`}
        >
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

      {(unfiled.length > 0 || attendance.length > 0) && (
        <section className="rounded-xl border border-hairline bg-surface px-4 py-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Not counted in the grade</h3>
          <div className="flex flex-wrap gap-1.5">
            {unfiled.map((r) => (
              <span key={r.id} title={requirementDetail(r)} className="rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-gray-700">
                {names.get(r.id)}
              </span>
            ))}
            {attendance.map((r) => (
              <span
                key={r.id}
                title="Attendance has no score, so it can't count toward the grade"
                className="rounded-full bg-subtle px-2 py-0.5 text-xs font-medium text-gray-400 line-through decoration-gray-300"
              >
                {names.get(r.id)}
              </span>
            ))}
          </div>
          {attendance.length > 0 && <p className="mt-2 text-xs text-gray-400">Attendance has no score, so it can&apos;t count.</p>}
        </section>
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
            message: "Every part and component goes, and no grade is shown until you set up a new split. Scores and the checklist are not touched.",
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
