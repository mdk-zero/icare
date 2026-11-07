"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowUp,
  faChevronDown,
  faChevronRight,
  faListCheck,
  faLock,
  faPen,
  faPlus,
  faRobot,
  faRotateLeft,
  faSearch,
  faTrashCan,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  fetchSkillCatalog,
  fetchSkillDetails,
  suggestScenarioSkills,
  type SkillDetail,
  type SkillSelection,
  type SkillStepDraft,
  type SkillSummary,
} from "../../lib/api";
import { MAX_SKILL_TITLE, MAX_STEP_TEXT } from "../../lib/skill-checklists";
import { EcgLoader } from "../../components/EcgLoader";
import { TAYLORS_CHAPTERS } from "../../../scripts/taylors-chapters";
import { bookSteps, chapterOf, checklistOf, isEdited, newOwnSkill, sectionsOf } from "./skill-checklist";

export interface SkillDetectInput {
  title: string;
  description?: string;
  learning_objectives?: string[];
  patient_id?: string | null;
  lesson_text?: string | null;
}

interface SkillPickerProps {
  value: SkillSelection[];
  onChange: (next: SkillSelection[]) => void;
  /** What detection reads: the scenario as it stands on the form. Without it there is no "Detect skills". */
  detectInput?: () => SkillDetectInput;
  disabled?: boolean;
  /** Chapters the case centres on; their skills are listed first. */
  focusChapters?: readonly number[];
}

const NO_CHAPTERS: readonly number[] = [];
/** The skills route serves at most this many skills' steps per request. */
const DETAIL_BATCH = 20;
const CHAPTER_NAME = new Map(TAYLORS_CHAPTERS.map((c) => [c.chapter, c.name]));

const fieldClass =
  "w-full rounded-lg border border-gray-300 bg-surface px-3 py-2 text-sm text-gray-900 outline-none placeholder:text-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30 disabled:bg-gray-50";
const iconButton =
  "grid h-7 w-7 shrink-0 place-items-center rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:pointer-events-none disabled:opacity-30";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * Picks the skills a scenario is built from. "Detect skills" reads the case
 * and ticks the Taylor's skills it calls for; faculty confirm, add or remove
 * any, and can write skills of their own, filed under a chapter. Each skill
 * becomes a task whose sub-tasks are its checklist steps: a Taylor's skill's
 * start as the book's, word for word, for the route picked here (oral, rectal,
 * axillary temperature). Faculty can rename any skill and add, reword, move or
 * delete its steps; that changes this scenario only, never the catalog.
 */
export default function SkillPicker({
  value,
  onChange,
  detectInput,
  disabled,
  focusChapters = NO_CHAPTERS,
}: SkillPickerProps) {
  const [catalog, setCatalog] = useState<SkillSummary[]>([]);
  const [details, setDetails] = useState<Record<string, SkillDetail>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [detecting, setDetecting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  // Saved skills unticked in the catalog, so ticking one again brings it back as it was.
  const [stash, setStash] = useState<Record<string, SkillSelection>>({});

  useEffect(() => {
    let live = true;
    void fetchSkillCatalog().then((skills) => live && setCatalog(skills));
    return () => {
      live = false;
    };
  }, []);

  // Steps and variants of every picked Taylor's skill, fetched once each.
  const missing = value.filter((s) => !s.own && !details[s.id]).map((s) => s.id);
  const missingKey = missing.join(",");
  useEffect(() => {
    if (!missingKey) return;
    let live = true;
    const ids = missingKey.split(",");
    const batches = Array.from({ length: Math.ceil(ids.length / DETAIL_BATCH) }, (_, i) =>
      ids.slice(i * DETAIL_BATCH, (i + 1) * DETAIL_BATCH),
    );
    void Promise.all(batches.map((batch) => fetchSkillDetails(batch))).then((fetched) => {
      if (!live) return;
      setDetails((prev) => ({ ...prev, ...Object.fromEntries(fetched.flat().map((d) => [d.id, d])) }));
    });
    return () => {
      live = false;
    };
  }, [missingKey]);

  const picked = new Set(value.map((s) => s.id));
  const byId = useMemo(() => new Map(catalog.map((s) => [s.id, s])), [catalog]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = new Map<string, SkillSummary[]>();
    for (const s of catalog) {
      if (q && !`${s.id} ${s.title} ${s.area}`.toLowerCase().includes(q)) continue;
      out.set(s.area, [...(out.get(s.area) ?? []), s]);
    }
    // Focus chapters first; otherwise book order (a stable sort keeps it).
    const focused = (list: SkillSummary[]) => (focusChapters.includes(list[0].chapter) ? 0 : 1);
    return [...out.entries()].sort((a, b) => focused(a[1]) - focused(b[1]));
  }, [catalog, search, focusChapters]);

  const update = (id: string, patch: Partial<SkillSelection>) =>
    onChange(value.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const remove = (sel: SkillSelection) => {
    if (sel.task_id) setStash((prev) => ({ ...prev, [sel.id]: sel }));
    setEditing(null);
    onChange(value.filter((s) => s.id !== sel.id));
  };

  const toggle = (id: string) => {
    const sel = value.find((s) => s.id === id);
    if (sel) remove(sel);
    else onChange([...value, stash[id] ?? { id }]);
  };

  const detect = async () => {
    if (!detectInput) return;
    const input = detectInput();
    if (!input.title.trim() && !input.description?.trim()) {
      setNote("Give the patient case a title or description first.");
      return;
    }
    setDetecting(true);
    setNote(null);
    const result = await suggestScenarioSkills(input);
    setDetecting(false);
    if ("error" in result) {
      setNote(result.error);
      return;
    }
    const fresh = result.suggestions;
    setReasons((prev) => ({ ...prev, ...Object.fromEntries(fresh.map((s) => [s.id, s.reason])) }));
    const add = fresh.filter((s) => !picked.has(s.id)).map((s) => stash[s.id] ?? { id: s.id });
    onChange([...value, ...add]);
    setNote(
      fresh.length === 0
        ? "No matching skills found — pick them from the list below."
        : result.source === "keywords"
          ? `Matched ${plural(fresh.length, "skill")} by keywords (AI is unavailable right now). Check them before saving.`
          : `Detected ${plural(fresh.length, "skill")}. Check them before saving.`,
    );
  };

  // Which chapters are open in the catalog; a search opens every chapter it matches.
  const [openChapters, setOpenChapters] = useState<Set<string>>(() => new Set());
  const [showPicked, setShowPicked] = useState(false);
  const searching = search.trim().length > 0;
  const toggleChapter = (area: string) =>
    setOpenChapters((prev) => {
      const next = new Set(prev);
      if (next.has(area)) next.delete(area);
      else next.add(area);
      return next;
    });

  // The picked skills by chapter in book order, own skills outside the book last.
  const pickedByChapter = useMemo(() => {
    const out = new Map<number, SkillSelection[]>();
    for (const sel of value) {
      const chapter = chapterOf(sel) ?? 0;
      out.set(chapter, [...(out.get(chapter) ?? []), sel]);
    }
    return [...out.entries()].sort((x, y) => (x[0] || 99) - (y[0] || 99));
  }, [value]);
  const chapterLabel = (chapter: number) =>
    chapter ? `Chapter ${chapter} · ${CHAPTER_NAME.get(chapter) ?? ""}` : "Your own skills · outside the book";

  // The skill open in the selected-skills dialog; the first one when none is.
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = value.find((s) => s.id === activeId) ?? value[0] ?? null;
  // The step being reworded, and the new step being typed, in the open skill.
  const [editing, setEditing] = useState<{ index: number; text: string } | null>(null);
  const [newStep, setNewStep] = useState("");
  const openSkill = (id: string) => {
    setActiveId(id);
    setEditing(null);
    setNewStep("");
  };

  const addOwnSkill = () => {
    const fresh = newOwnSkill();
    onChange([...value, fresh]);
    openSkill(fresh.id);
    setShowPicked(true);
  };

  const nameOf = (sel: SkillSelection) =>
    sel.own ? sel.title || "Untitled skill" : sel.title || byId.get(sel.id)?.title || details[sel.id]?.title || "";

  /** A line under each skill in the dialog's list: how many steps, and whether they are the book's. */
  const stepsLine = (sel: SkillSelection) => {
    const detail = details[sel.id];
    const steps = checklistOf(sel, detail);
    if (!steps) return null;
    if (steps.length === 0) return { text: "No steps yet", warn: true };
    if (sel.own) return { text: plural(steps.length, "step"), warn: false };
    return detail && isEdited(sel, detail)
      ? { text: `${plural(steps.length, "step")} · edited`, warn: true }
      : { text: `All ${steps.length} steps`, warn: false };
  };

  const skillPanel = (sel: SkillSelection) => {
    const detail = sel.own ? undefined : details[sel.id];
    const steps = checklistOf(sel, detail);
    if (!steps) return <p className="p-6 text-center text-sm text-gray-400">Loading the checklist…</p>;
    const locked = !!sel.locked;
    const frozen = disabled || locked;
    const variants = detail?.variants;
    const sections = detail ? sectionsOf(sel, detail) : [];
    const edited = detail ? isEdited(sel, detail) : false;
    // A Taylor's skill keeps a step, so its task always has something to grade.
    const minSteps = sel.own ? 0 : 1;

    const setSteps = (next: SkillStepDraft[]) => update(sel.id, { steps: next, skipped: undefined });
    const move = (from: number, to: number) => {
      const next = [...steps];
      const [step] = next.splice(from, 1);
      next.splice(to, 0, step);
      setSteps(next);
      setEditing(null);
    };
    const saveEdit = () => {
      if (!editing) return;
      const text = editing.text.trim();
      if (text) setSteps(steps.map((st, i) => (i === editing.index ? { ...st, text } : st)));
      setEditing(null);
    };
    const addStep = () => {
      const text = newStep.trim();
      if (!text) return;
      setSteps([...steps, { text }]);
      setNewStep("");
    };
    const onEditKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        saveEdit();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setEditing(null);
      }
    };
    const resetToBook = () => {
      if (!detail) return;
      // A saved skill sends its steps whole; a new one goes back to following the book.
      update(sel.id, { steps: sel.task_id ? bookSteps(detail, sections) : undefined, skipped: undefined });
      setEditing(null);
    };
    const pickSections = (next: string[]) => {
      if (!detail) return;
      // Another route means the book's steps for it, so edits start over.
      update(sel.id, { sections: next, skipped: undefined, steps: sel.steps ? bookSteps(detail, next) : undefined });
      setEditing(null);
    };

    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1 space-y-2">
            <p className="font-mono text-xs text-brand-700">{sel.own ? "Your own skill" : `Skill ${sel.id}`}</p>
            <label className="block">
              <span className="sr-only">Skill name</span>
              <input
                type="text"
                value={sel.title ?? (sel.own ? "" : (detail?.title ?? ""))}
                onChange={(e) => update(sel.id, { title: e.target.value })}
                maxLength={MAX_SKILL_TITLE}
                disabled={disabled}
                // A new skill of your own starts at its name.
                autoFocus={sel.own && !sel.task_id && !sel.title}
                placeholder={sel.own ? "Name the skill, e.g. Hospital-specific ID band check" : detail?.title}
                className={`${fieldClass} font-display text-base font-semibold`}
              />
            </label>
            {!sel.own && detail && sel.title && sel.title.trim() !== detail.title && (
              <button
                type="button"
                onClick={() => update(sel.id, { title: detail.title })}
                disabled={disabled}
                className="text-xs font-semibold text-brand-700 hover:underline"
              >
                Use the book&apos;s name: {detail.title}
              </button>
            )}
            {detail?.goal && <p className="text-xs text-gray-600">Goal: {detail.goal}</p>}
            {reasons[sel.id] && <p className="text-xs italic text-gray-600">{reasons[sel.id]}</p>}
          </div>
          <button
            type="button"
            onClick={() => remove(sel)}
            disabled={frozen}
            title={locked ? "Students have been graded on it, so it stays" : undefined}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
            Remove skill
          </button>
        </div>

        {locked && (
          <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <FontAwesomeIcon icon={faLock} className="mt-0.5 h-3 w-3 shrink-0" />
            Students have been graded on this skill, so it stays on and its steps stay as they are. You can still rename it.
          </p>
        )}

        {sel.own && (
          <label className="block max-w-md">
            <span className="mb-1 block text-xs font-semibold text-gray-700">Chapter</span>
            <select
              value={sel.chapter ?? ""}
              onChange={(e) => update(sel.id, { chapter: e.target.value ? Number(e.target.value) : null })}
              disabled={disabled}
              className={fieldClass}
            >
              <option value="">Outside the book (no chapter)</option>
              {TAYLORS_CHAPTERS.map((c) => (
                <option key={c.chapter} value={c.chapter}>
                  Chapter {c.chapter} · {c.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {variants && variants.sections.length > 1 && (
          <fieldset className="rounded-lg border border-hairline bg-subtle px-3 py-2.5" disabled={frozen}>
            <legend className="px-1 text-xs font-semibold text-gray-700">
              {variants.alternatives ? "Which way the student does it" : "Parts to include"}
            </legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {variants.sections.map((section) => {
                const on = sections.includes(section);
                return (
                  <label key={section} className="flex items-center gap-1.5 text-sm text-gray-700">
                    <input
                      type={variants.alternatives ? "radio" : "checkbox"}
                      name={`variant-${sel.id}`}
                      checked={on}
                      disabled={!variants.alternatives && on && sections.length === 1}
                      onChange={() =>
                        pickSections(
                          variants.alternatives ? [section] : on ? sections.filter((x) => x !== section) : [...sections, section],
                        )
                      }
                      className="accent-brand-600"
                    />
                    {section}
                  </label>
                );
              })}
            </div>
            {edited && <p className="mt-1.5 text-[11px] text-gray-500">Changing this starts the steps over from the book.</p>}
          </fieldset>
        )}

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-gray-800">Steps students demonstrate</p>
            <span className="rounded-full bg-brand-600/10 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
              {plural(steps.length, "step")}
            </span>
            {edited && (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">Edited</span>
            )}
            {edited && !locked && (
              <button
                type="button"
                onClick={resetToBook}
                disabled={disabled}
                className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-brand-700 hover:underline"
              >
                <FontAwesomeIcon icon={faRotateLeft} className="h-3 w-3" />
                Reset to Taylor&apos;s checklist
              </button>
            )}
          </div>
          {!locked && (
            <p className="mt-0.5 text-xs text-gray-500">
              Each step is graded on its own. Reword, move or delete any; changes apply to this activity only.
            </p>
          )}
          {steps.length > 0 ? (
            <ol className="mt-2 divide-y divide-hairline overflow-hidden rounded-lg border border-hairline">
              {steps.map((st, i) => {
                const isEditing = editing?.index === i;
                return (
                  <li key={st.id ?? `${i}-${st.position ?? "own"}`} className="group flex items-start gap-2 px-3 py-2 text-sm">
                    <span className="w-6 shrink-0 pt-0.5 text-right font-mono text-xs leading-5 text-gray-400">{i + 1}</span>
                    {isEditing ? (
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <textarea
                          value={editing.text}
                          onChange={(e) => setEditing({ index: i, text: e.target.value })}
                          onKeyDown={onEditKey}
                          maxLength={MAX_STEP_TEXT}
                          rows={2}
                          autoFocus
                          aria-label={`Step ${i + 1}`}
                          className={`${fieldClass} resize-y`}
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={saveEdit}
                            disabled={!editing.text.trim()}
                            className="rounded-md bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
                          >
                            Save step
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(null)}
                            className="rounded-md px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <span className="min-w-0 flex-1 leading-5 text-gray-800">{st.text}</span>
                        {!frozen && (
                          <span className="flex shrink-0 items-center opacity-100 sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                            <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move step ${i + 1} up`} className={iconButton}>
                              <FontAwesomeIcon icon={faArrowUp} className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => move(i, i + 1)}
                              disabled={i === steps.length - 1}
                              aria-label={`Move step ${i + 1} down`}
                              className={iconButton}
                            >
                              <FontAwesomeIcon icon={faArrowDown} className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditing({ index: i, text: st.text })}
                              aria-label={`Edit step ${i + 1}`}
                              className={iconButton}
                            >
                              <FontAwesomeIcon icon={faPen} className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setSteps(steps.filter((_, j) => j !== i));
                                setEditing(null);
                              }}
                              disabled={steps.length <= minSteps}
                              aria-label={`Delete step ${i + 1}`}
                              title={steps.length <= minSteps ? "Keep at least one step" : undefined}
                              className={`${iconButton} hover:bg-red-50 hover:text-red-600`}
                            >
                              <FontAwesomeIcon icon={faTrashCan} className="h-3 w-3" />
                            </button>
                          </span>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-2 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 px-3 py-3 text-center text-xs text-amber-900">
              No steps yet. Add the steps students should demonstrate.
            </p>
          )}
          {!frozen && (
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={newStep}
                onChange={(e) => setNewStep(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addStep();
                  }
                }}
                maxLength={MAX_STEP_TEXT}
                placeholder={`Step ${steps.length + 1}, e.g. Verify the patient's identity using two identifiers`}
                aria-label="New step"
                className={fieldClass}
              />
              <button
                type="button"
                onClick={addStep}
                disabled={!newStep.trim()}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-brand-600/40 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-600/5 disabled:opacity-40"
              >
                <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                Add step
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="rounded-xl border border-hairline bg-surface p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-gray-800">
            <FontAwesomeIcon icon={faListCheck} className="h-3.5 w-3.5 text-brand-600" />
            Skills
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            Each skill becomes a task, and its steps become the sub-tasks you grade. Rename any skill, add your own, and
            add, edit or delete steps.
          </p>
        </div>
        {detectInput && (
          <button
            type="button"
            onClick={detect}
            disabled={disabled || detecting}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-brand-600/40 bg-surface px-3 py-1.5 text-xs font-semibold text-brand-700 transition-all hover:bg-brand-600/5 disabled:opacity-50"
          >
            {detecting ? <EcgLoader className="text-brand-600" /> : <FontAwesomeIcon icon={faRobot} className="h-3.5 w-3.5" />}
            {detecting ? "Detecting…" : "Detect skills"}
          </button>
        )}
      </div>
      {note && <p className="mt-2 text-xs text-gray-600">{note}</p>}

      {/* Picked: a summary here, the full list in a dialog. */}
      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-lg border border-hairline bg-subtle px-3 py-2.5">
        <span className="text-sm font-semibold text-gray-800">
          {value.length === 0 ? "No skills selected" : `${plural(value.length, "skill")} selected`}
        </span>
        {pickedByChapter.map(([chapter, items]) => (
          <span key={chapter} className="rounded-full bg-brand-600/10 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
            {chapter ? `Ch. ${chapter} · ${items.length}` : `Own · ${items.length}`}
          </span>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            onClick={addOwnSkill}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-600/40 bg-surface px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-600/5 disabled:opacity-40"
          >
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
            Add your own skill
          </button>
          <button
            type="button"
            onClick={() => setShowPicked(true)}
            disabled={value.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
          >
            Edit skills and steps
          </button>
        </div>
      </div>

      {/* Catalog: one dropdown per chapter. */}
      <div className="relative mt-3">
        <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search Taylor's skills, e.g. oxygen, blood pressure, 15-1"
          className="w-full rounded-lg border border-gray-300 bg-surface py-2 pl-9 pr-3 text-sm text-gray-900 outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30"
        />
      </div>
      <div className="custom-scrollbar mt-2 max-h-[340px] overflow-y-auto rounded-lg border border-hairline">
        {catalog.length === 0 ? (
          <p className="p-4 text-center text-xs text-gray-500">Loading the skills catalog…</p>
        ) : groups.length === 0 ? (
          <p className="p-4 text-center text-xs text-gray-500">No skills match.</p>
        ) : (
          groups.map(([area, skills]) => {
            const open = searching || openChapters.has(area);
            const count = skills.filter((x) => picked.has(x.id)).length;
            return (
              <div key={area} className="border-t border-hairline first:border-t-0">
                <button
                  type="button"
                  onClick={() => toggleChapter(area)}
                  aria-expanded={open}
                  className="sticky top-0 z-10 flex w-full items-center gap-2 bg-subtle px-3 py-2 text-left hover:bg-gray-100"
                >
                  <FontAwesomeIcon icon={open ? faChevronDown : faChevronRight} className="h-3 w-3 shrink-0 text-gray-400" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-800">
                    Chapter {skills[0].chapter} · {area}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      count > 0 ? "bg-brand-600/10 text-brand-700" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {count}/{skills.length}
                  </span>
                </button>
                {open &&
                  skills.map((sk) => {
                    const sel = value.find((s) => s.id === sk.id);
                    const locked = !!sel?.locked;
                    return (
                      <label
                        key={sk.id}
                        className={`flex items-center gap-2 border-t border-hairline/70 py-1.5 pl-8 pr-3 text-sm ${
                          locked ? "" : "cursor-pointer hover:bg-subtle"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={!!sel}
                          disabled={disabled || locked}
                          onChange={() => toggle(sk.id)}
                          className="accent-brand-600"
                        />
                        <span className="w-11 shrink-0 font-mono text-xs text-gray-500">{sk.id}</span>
                        <span className="text-gray-800">{sk.title}</span>
                        {locked && <span className="ml-auto text-[11px] text-gray-500">Graded, stays</span>}
                      </label>
                    );
                  })}
              </div>
            );
          })
        )}
      </div>

      {showPicked && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={() => setShowPicked(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="picked-skills-title"
            className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-hairline bg-subtle px-5 py-3">
              <div>
                <h2 id="picked-skills-title" className="font-display text-lg font-semibold text-gray-900">
                  Skills and steps
                </h2>
                <p className="text-sm text-gray-500">
                  {`${plural(value.length, "skill")}. Pick one to rename it, choose how it's done, and add, edit or delete the steps students demonstrate.`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPicked(false)}
                aria-label="Close"
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
              </button>
            </div>
            <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,40%)_minmax(0,1fr)] md:grid-cols-[320px_minmax(0,1fr)] md:grid-rows-1">
              <nav
                aria-label="Selected skills"
                className="custom-scrollbar min-h-0 space-y-4 overflow-y-auto border-b border-hairline p-3 md:border-b-0 md:border-r"
              >
                {pickedByChapter.map(([chapter, items]) => (
                  <section key={chapter}>
                    <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                      {chapterLabel(chapter)}
                    </h3>
                    <ul className="space-y-1">
                      {items.map((sel) => {
                        const line = stepsLine(sel);
                        const on = sel.id === active?.id;
                        return (
                          <li key={sel.id}>
                            <button
                              type="button"
                              onClick={() => openSkill(sel.id)}
                              aria-current={on ? "true" : undefined}
                              className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                                on ? "border-brand-600/50 bg-brand-600/10" : "border-transparent hover:bg-subtle"
                              }`}
                            >
                              <p className="text-sm font-semibold text-gray-900">
                                <span className="font-mono text-xs text-brand-700">{sel.own ? "Own" : sel.id}</span>{" "}
                                {nameOf(sel)}
                                {sel.locked && <FontAwesomeIcon icon={faLock} className="ml-1.5 h-2.5 w-2.5 text-gray-400" />}
                              </p>
                              {line && (
                                <p className={`text-[11px] ${line.warn ? "font-semibold text-amber-700" : "text-gray-500"}`}>
                                  {line.text}
                                </p>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
                <button
                  type="button"
                  onClick={addOwnSkill}
                  disabled={disabled}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-brand-600/40 px-3 py-2 text-xs font-semibold text-brand-700 hover:bg-brand-600/5 disabled:opacity-40"
                >
                  <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                  Add your own skill
                </button>
              </nav>
              <div className="custom-scrollbar min-h-0 overflow-y-auto p-5">
                {active ? (
                  skillPanel(active)
                ) : (
                  <p className="p-6 text-center text-sm text-gray-400">
                    No skills yet. Tick Taylor&apos;s skills in the list, or add your own.
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end border-t border-hairline px-5 py-3">
              <button
                type="button"
                onClick={() => setShowPicked(false)}
                className="rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
