"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faChevronRight, faListCheck, faRobot, faSearch, faXmark } from "@fortawesome/free-solid-svg-icons";
import {
  fetchSkillCatalog,
  fetchSkillDetails,
  suggestScenarioSkills,
  type SkillDetail,
  type SkillSelection,
  type SkillSummary,
} from "../../lib/api";
import { EcgLoader } from "../../components/EcgLoader";

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
  /** Skills the scenario already has, which can't be picked again. */
  existingIds?: readonly string[];
  /** What a skill it already has says in the list. */
  existingLabel?: string;
  disabled?: boolean;
  /** Chapters the case centres on; their skills are listed first. */
  focusChapters?: readonly number[];
}

const NO_CHAPTERS: readonly number[] = [];

/**
 * Picks the Taylor's skills a scenario is built from. "Detect skills" reads the
 * case and ticks the skills it calls for; faculty confirm, add or remove any.
 * Each skill becomes a task whose sub-tasks are its checklist steps, word for
 * word; a skill with alternative routes (oral, rectal, axillary temperature)
 * includes only the route picked here.
 */
export default function SkillPicker({
  value,
  onChange,
  detectInput,
  existingIds = [],
  existingLabel = "In patient case",
  disabled,
  focusChapters = NO_CHAPTERS,
}: SkillPickerProps) {
  const [catalog, setCatalog] = useState<SkillSummary[]>([]);
  const [details, setDetails] = useState<Record<string, SkillDetail>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [detecting, setDetecting] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let live = true;
    void fetchSkillCatalog().then((skills) => live && setCatalog(skills));
    return () => {
      live = false;
    };
  }, []);

  // Steps and variants of every picked skill, fetched once each.
  const missing = value.map((s) => s.id).filter((id) => !details[id]);
  const missingKey = missing.join(",");
  useEffect(() => {
    if (!missingKey) return;
    let live = true;
    void fetchSkillDetails(missingKey.split(",")).then((fetched) => {
      if (!live) return;
      setDetails((prev) => ({ ...prev, ...Object.fromEntries(fetched.map((d) => [d.id, d])) }));
    });
    return () => {
      live = false;
    };
  }, [missingKey]);

  const picked = new Set(value.map((s) => s.id));
  const existing = new Set(existingIds);
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

  const toggle = (id: string) =>
    onChange(picked.has(id) ? value.filter((s) => s.id !== id) : [...value, { id }]);

  const setSections = (id: string, sections: string[]) =>
    onChange(value.map((s) => (s.id === id ? { ...s, sections } : s)));

  const setSkipped = (id: string, skipped: number[]) =>
    onChange(value.map((s) => (s.id === id ? { ...s, skipped } : s)));

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
    const fresh = result.suggestions.filter((s) => !existing.has(s.id));
    setReasons((prev) => ({ ...prev, ...Object.fromEntries(fresh.map((s) => [s.id, s.reason])) }));
    const add = fresh.filter((s) => !picked.has(s.id)).map((s) => ({ id: s.id }));
    onChange([...value, ...add]);
    setNote(
      fresh.length === 0
        ? "No matching skills found — pick them from the list below."
        : result.source === "keywords"
          ? `Matched ${fresh.length} skill${fresh.length === 1 ? "" : "s"} by keywords (AI is unavailable right now). Check them before saving.`
          : `Detected ${fresh.length} skill${fresh.length === 1 ? "" : "s"}. Check them before saving.`,
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

  // The picked skills, by chapter in book order, for the list and its summary.
  const pickedByChapter = useMemo(() => {
    const out = new Map<number, { area: string; items: SkillSelection[] }>();
    for (const sel of value) {
      const summary = byId.get(sel.id);
      const chapter = summary?.chapter ?? Number(sel.id.split("-")[0]);
      const entry = out.get(chapter) ?? { area: summary?.area ?? "", items: [] };
      entry.items.push(sel);
      out.set(chapter, entry);
    }
    return [...out.entries()].sort((x, y) => x[0] - y[0]);
  }, [value, byId]);

  // The skill open in the selected-skills dialog; the first one when none is.
  const [activeId, setActiveId] = useState<string | null>(null);
  const active = value.find((s) => s.id === activeId) ?? value[0] ?? null;

  /** The steps the chosen routes cover, and how many of them stay in. */
  const stepsOf = (sel: SkillSelection) => {
    const detail = details[sel.id];
    if (!detail) return null;
    const sections = sel.sections ?? detail.variants.defaults;
    const steps = detail.steps.filter((st) => st.section === null || sections.includes(st.section));
    const skipped = new Set(sel.skipped ?? []);
    const kept = steps.filter((st) => !skipped.has(st.position)).length;
    return { detail, sections, steps, skipped, kept };
  };

  const skillPanel = (sel: SkillSelection) => {
    const summary = byId.get(sel.id);
    const info = stepsOf(sel);
    if (!info) return <p className="p-6 text-center text-sm text-gray-400">Loading the checklist…</p>;
    const { detail, sections, steps, skipped, kept } = info;
    const variants = detail.variants;
    const toggleStep = (position: number) => {
      const next = new Set(skipped);
      if (next.has(position)) next.delete(position);
      else next.add(position);
      setSkipped(sel.id, [...next]);
    };
    return (
      <div className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-xs text-brand-700">Skill {sel.id}</p>
            <h3 className="font-display text-lg font-semibold text-gray-900">{summary?.title ?? detail.title}</h3>
            {detail.goal && <p className="mt-0.5 text-xs text-gray-600">Goal: {detail.goal}</p>}
            {reasons[sel.id] && <p className="mt-1 text-xs italic text-gray-600">{reasons[sel.id]}</p>}
          </div>
          <button
            type="button"
            onClick={() => toggle(sel.id)}
            disabled={disabled}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40"
          >
            <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
            Remove skill
          </button>
        </div>

        {variants.sections.length > 1 && (
          <fieldset className="rounded-lg border border-hairline bg-subtle px-3 py-2.5">
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
                      disabled={disabled || (!variants.alternatives && on && sections.length === 1)}
                      onChange={() =>
                        setSections(
                          sel.id,
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
          </fieldset>
        )}

        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-gray-800">Checklist steps</p>
            <span className="rounded-full bg-brand-600/10 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
              {kept} of {steps.length} included
            </span>
            <span className="text-xs text-gray-500">Uncheck any step students won&apos;t do here. They won&apos;t be graded on it.</span>
            {kept < steps.length && (
              <button
                type="button"
                onClick={() => setSkipped(sel.id, [])}
                disabled={disabled}
                className="ml-auto text-xs font-semibold text-brand-700 hover:underline"
              >
                Include all
              </button>
            )}
          </div>
          <ol className="mt-2 divide-y divide-hairline overflow-hidden rounded-lg border border-hairline">
            {steps.map((st) => {
              const on = !skipped.has(st.position);
              // At least one step stays, so the task always has something to grade.
              const last = on && kept === 1;
              return (
                <li key={st.position}>
                  <label
                    className={`flex items-start gap-3 px-3 py-2 text-sm ${last ? "" : "cursor-pointer hover:bg-subtle"} ${
                      on ? "" : "bg-gray-50"
                    }`}
                    title={last ? "Keep at least one step" : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={disabled || last}
                      onChange={() => toggleStep(st.position)}
                      className="mt-0.5 accent-brand-600"
                    />
                    <span className="w-6 shrink-0 text-right font-mono text-xs leading-5 text-gray-400">{st.stepNo}</span>
                    <span className={on ? "text-gray-800" : "text-gray-400 line-through"}>{st.text}</span>
                  </label>
                </li>
              );
            })}
          </ol>
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
            Each skill becomes a task, and its checklist steps become the sub-tasks you grade.
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
          {value.length === 0 ? "No skills selected" : `${value.length} skill${value.length === 1 ? "" : "s"} selected`}
        </span>
        {pickedByChapter.map(([chapter, g]) => (
          <span key={chapter} className="rounded-full bg-brand-600/10 px-2 py-0.5 text-[11px] font-semibold text-brand-700">
            {`Ch. ${chapter} · ${g.items.length}`}
          </span>
        ))}
        <button
          type="button"
          onClick={() => setShowPicked(true)}
          disabled={value.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-40"
        >
          View selected skills
        </button>
      </div>

      {/* Catalog: one dropdown per chapter. */}
      <div className="relative mt-3">
        <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills, e.g. oxygen, blood pressure, 15-1"
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
            const count = skills.filter((x) => picked.has(x.id) || existing.has(x.id)).length;
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
                    const already = existing.has(sk.id);
                    return (
                      <label
                        key={sk.id}
                        className={`flex items-center gap-2 border-t border-hairline/70 py-1.5 pl-8 pr-3 text-sm ${
                          already ? "opacity-50" : "cursor-pointer hover:bg-subtle"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={already || picked.has(sk.id)}
                          disabled={disabled || already}
                          onChange={() => toggle(sk.id)}
                          className="accent-brand-600"
                        />
                        <span className="w-11 shrink-0 font-mono text-xs text-gray-500">{sk.id}</span>
                        <span className="text-gray-800">{sk.title}</span>
                        {already && <span className="ml-auto text-[11px] text-gray-500">{existingLabel}</span>}
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
                  Selected skills
                </h2>
                <p className="text-sm text-gray-500">
                  {`${value.length} skill${value.length === 1 ? "" : "s"} in ${pickedByChapter.length} chapter${pickedByChapter.length === 1 ? "" : "s"}. Click a skill to choose how it's done and which steps students are graded on.`}
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
            {!active ? (
              <p className="flex-1 p-6 text-center text-sm text-gray-400">No skills selected.</p>
            ) : (
              <div className="grid min-h-0 flex-1 grid-rows-[minmax(0,40%)_minmax(0,1fr)] md:grid-cols-[320px_minmax(0,1fr)] md:grid-rows-1">
                <nav
                  aria-label="Selected skills"
                  className="custom-scrollbar min-h-0 space-y-4 overflow-y-auto border-b border-hairline p-3 md:border-b-0 md:border-r"
                >
                  {pickedByChapter.map(([chapter, g]) => (
                    <section key={chapter}>
                      <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                        Chapter {chapter} · {g.area}
                      </h3>
                      <ul className="space-y-1">
                        {g.items.map((sel) => {
                          const info = stepsOf(sel);
                          const on = sel.id === active.id;
                          const partial = info && info.kept < info.steps.length;
                          return (
                            <li key={sel.id}>
                              <button
                                type="button"
                                onClick={() => setActiveId(sel.id)}
                                aria-current={on ? "true" : undefined}
                                className={`w-full rounded-lg border px-3 py-2 text-left transition-colors ${
                                  on ? "border-brand-600/50 bg-brand-600/10" : "border-transparent hover:bg-subtle"
                                }`}
                              >
                                <p className="text-sm font-semibold text-gray-900">
                                  <span className="font-mono text-xs text-brand-700">{sel.id}</span>{" "}
                                  {byId.get(sel.id)?.title ?? ""}
                                </p>
                                {info && (
                                  <p className={`text-[11px] ${partial ? "font-semibold text-amber-700" : "text-gray-500"}`}>
                                    {partial ? `${info.kept} of ${info.steps.length} steps` : `All ${info.steps.length} steps`}
                                  </p>
                                )}
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  ))}
                </nav>
                <div className="custom-scrollbar min-h-0 overflow-y-auto p-5">{skillPanel(active)}</div>
              </div>
            )}
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
