"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faListCheck, faRobot, faSearch, faXmark } from "@fortawesome/free-solid-svg-icons";
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
  /** What detection reads: the scenario as it stands on the form. */
  detectInput: () => SkillDetectInput;
  /** Skills the scenario already has, which can't be picked again. */
  existingIds?: readonly string[];
  disabled?: boolean;
}

/**
 * Picks the Taylor's skills a scenario is built from. "Detect skills" reads the
 * case and ticks the skills it calls for; faculty confirm, add or remove any.
 * Each skill becomes a task whose sub-tasks are its checklist steps, word for
 * word; a skill with alternative routes (oral, rectal, axillary temperature)
 * includes only the route picked here.
 */
export default function SkillPicker({ value, onChange, detectInput, existingIds = [], disabled }: SkillPickerProps) {
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
    return [...out.entries()];
  }, [catalog, search]);

  const toggle = (id: string) =>
    onChange(picked.has(id) ? value.filter((s) => s.id !== id) : [...value, { id }]);

  const setSections = (id: string, sections: string[]) =>
    onChange(value.map((s) => (s.id === id ? { ...s, sections } : s)));

  const detect = async () => {
    const input = detectInput();
    if (!input.title.trim() && !input.description?.trim()) {
      setNote("Give the scenario a title or description first.");
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

  return (
    <div className="rounded-xl border border-hairline bg-surface p-4 shadow-[0_1px_3px_0_rgba(0,0,0,0.04)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-gray-800">
            <FontAwesomeIcon icon={faListCheck} className="h-3.5 w-3.5 text-brand-600" />
            Taylor&apos;s skills
          </p>
          <p className="mt-0.5 text-xs text-gray-500">
            Each skill becomes a task, and its checklist steps become the sub-tasks you grade.
          </p>
        </div>
        <button
          type="button"
          onClick={detect}
          disabled={disabled || detecting}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-brand-600/40 bg-surface px-3 py-1.5 text-xs font-semibold text-brand-700 transition-all hover:bg-brand-600/5 disabled:opacity-50"
        >
          {detecting ? <EcgLoader className="text-brand-600" /> : <FontAwesomeIcon icon={faRobot} className="h-3.5 w-3.5" />}
          {detecting ? "Detecting…" : "Detect skills"}
        </button>
      </div>
      {note && <p className="mt-2 text-xs text-gray-600">{note}</p>}

      {/* Picked */}
      {value.length > 0 && (
        <ul className="mt-3 space-y-2">
          {value.map((sel) => {
            const summary = byId.get(sel.id);
            const detail = details[sel.id];
            const variants = detail?.variants;
            const sections = sel.sections ?? variants?.defaults ?? [];
            const stepCount = detail
              ? detail.steps.filter((st) => st.section === null || sections.includes(st.section)).length
              : null;
            return (
              <li key={sel.id} className="rounded-lg border border-brand-600/30 bg-brand-600/5 px-3 py-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                      <span className="font-mono text-xs text-brand-700">Skill {sel.id}</span>{" "}
                      {summary?.title ?? ""}
                    </p>
                    <p className="text-[11px] text-gray-500">
                      {summary?.area}
                      {stepCount !== null && ` · ${stepCount} checklist steps`}
                    </p>
                    {reasons[sel.id] && <p className="mt-0.5 text-xs italic text-gray-600">{reasons[sel.id]}</p>}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggle(sel.id)}
                    disabled={disabled}
                    aria-label={`Remove Skill ${sel.id}`}
                    className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                  >
                    <FontAwesomeIcon icon={faXmark} className="h-3 w-3" />
                  </button>
                </div>
                {variants && variants.sections.length > 1 && (
                  <fieldset className="mt-2">
                    <legend className="text-[11px] font-semibold text-gray-600">
                      {variants.alternatives ? "Route the student performs" : "Parts to include"}
                    </legend>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      {variants.sections.map((section) => {
                        const on = sections.includes(section);
                        return (
                          <label key={section} className="flex items-center gap-1.5 text-xs text-gray-700">
                            <input
                              type={variants.alternatives ? "radio" : "checkbox"}
                              name={`variant-${sel.id}`}
                              checked={on}
                              disabled={disabled}
                              onChange={() =>
                                setSections(
                                  sel.id,
                                  variants.alternatives
                                    ? [section]
                                    : on
                                      ? sections.filter((s) => s !== section)
                                      : [...sections, section],
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
              </li>
            );
          })}
        </ul>
      )}

      {/* Catalog */}
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
      <div className="custom-scrollbar mt-2 max-h-[260px] overflow-y-auto rounded-lg border border-hairline">
        {catalog.length === 0 ? (
          <p className="p-4 text-center text-xs text-gray-500">Loading the skills catalog…</p>
        ) : groups.length === 0 ? (
          <p className="p-4 text-center text-xs text-gray-500">No skills match.</p>
        ) : (
          groups.map(([area, skills]) => (
            <div key={area}>
              <p className="sticky top-0 bg-subtle px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                {area}
              </p>
              {skills.map((s) => {
                const already = existing.has(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex items-center gap-2 border-t border-hairline/70 px-3 py-1.5 text-sm ${
                      already ? "opacity-50" : "cursor-pointer hover:bg-subtle"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={already || picked.has(s.id)}
                      disabled={disabled || already}
                      onChange={() => toggle(s.id)}
                      className="accent-brand-600"
                    />
                    <span className="w-11 shrink-0 font-mono text-xs text-gray-500">{s.id}</span>
                    <span className="text-gray-800">{s.title}</span>
                    {already && <span className="ml-auto text-[11px] text-gray-500">In scenario</span>}
                  </label>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
