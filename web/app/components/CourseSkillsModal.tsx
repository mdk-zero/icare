"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronDown,
  faChevronRight,
  faListCheck,
  faRobot,
  faSearch,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import { fetchSkillCatalog, type SkillSuggestion, type SkillSummary } from "../lib/api";
import { EcgLoader } from "./EcgLoader";
import { loadingToast } from "./Toast";

type Result<T> = { data: T; error?: undefined } | { data?: undefined; error: string };

/**
 * Edits a course's shared skill list: the part of the skills catalog the
 * course covers. The Dean and every instructor teaching the course see the
 * same list. "Detect with AI" ticks the skills the course's code, title and
 * description point at; nothing is saved until Save.
 */
export default function CourseSkillsModal({
  course,
  initial,
  onSuggest,
  onSave,
  onClose,
  onSaved,
}: {
  course: { code: string; title: string };
  initial: readonly string[];
  onSuggest: () => Promise<Result<{ suggestions: SkillSuggestion[]; source: "ai" | "keywords" }>>;
  onSave: (skillIds: string[], aiSkillIds: string[]) => Promise<Result<{ skill_ids: string[] }>>;
  onClose: () => void;
  onSaved: (skillIds: string[]) => void;
}) {
  const [catalog, setCatalog] = useState<SkillSummary[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initial));
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [search, setSearch] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  /** Expanded chapters; null until the user toggles one, meaning "chapters with picks". */
  const [open, setOpen] = useState<Set<string> | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchSkillCatalog().then((skills) => live && setCatalog(skills));
    return () => {
      live = false;
    };
  }, []);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const out = new Map<number, { area: string; skills: SkillSummary[] }>();
    for (const s of catalog ?? []) {
      if (q && !`${s.id} ${s.title} ${s.area}`.toLowerCase().includes(q)) continue;
      if (onlySelected && !selected.has(s.id)) continue;
      const group = out.get(s.chapter) ?? { area: s.area, skills: [] };
      group.skills.push(s);
      out.set(s.chapter, group);
    }
    return [...out.entries()].sort((a, b) => a[0] - b[0]);
  }, [catalog, search, onlySelected, selected]);

  const filtering = search.trim().length > 0 || onlySelected;
  const isOpen = (chapter: number, skills: SkillSummary[]) =>
    filtering || (open ? open.has(String(chapter)) : skills.some((s) => selected.has(s.id)));

  const toggleChapterOpen = (chapter: number, skills: SkillSummary[]) => {
    const key = String(chapter);
    const next = new Set(
      open ?? groups.filter(([, g]) => g.skills.some((s) => selected.has(s.id))).map(([ch]) => String(ch)),
    );
    if (isOpen(chapter, skills)) next.delete(key);
    else next.add(key);
    setOpen(next);
  };

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setChapter = (skills: SkillSummary[], on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const s of skills) {
        if (on) next.add(s.id);
        else next.delete(s.id);
      }
      return next;
    });

  const detect = async () => {
    setDetecting(true);
    setNote(null);
    const result = await onSuggest();
    setDetecting(false);
    if (result.error !== undefined) {
      setNote(result.error);
      return;
    }
    const { suggestions, source } = result.data;
    if (suggestions.length === 0) {
      setNote("Nothing in the course details pointed at a skill. Pick them below, or add a description and try again.");
      return;
    }
    setReasons((prev) => ({ ...prev, ...Object.fromEntries(suggestions.map((s) => [s.id, s.reason])) }));
    setSelected((prev) => new Set([...prev, ...suggestions.map((s) => s.id)]));
    setOpen(null);
    setNote(
      source === "ai"
        ? `Ticked ${suggestions.length} skill${suggestions.length === 1 ? "" : "s"} the course covers. Review them before saving.`
        : `The AI is unavailable right now, so ${suggestions.length} skill${suggestions.length === 1 ? " was" : "s were"} matched from keywords. Review before saving.`,
    );
  };

  const save = async () => {
    setSaving(true);
    const ids = [...selected];
    const progress = loadingToast(`Saving ${course.code} skills…`);
    const result = await onSave(
      ids,
      ids.filter((id) => id in reasons),
    );
    setSaving(false);
    if (result.error !== undefined) {
      progress.error(result.error);
      setNote(result.error);
      return;
    }
    progress.success(`${course.code} now covers ${ids.length} skill${ids.length === 1 ? "" : "s"}`);
    onSaved(result.data.skill_ids);
  };

  const busy = detecting || saving;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={busy ? undefined : onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline bg-subtle px-5 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/10">
              <FontAwesomeIcon icon={faListCheck} className="h-5 w-5 text-brand-600" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-display text-lg font-semibold text-gray-900">
                {course.code} skills
              </h2>
              <p className="truncate text-sm text-gray-500">
                {selected.size} selected · shared by every instructor teaching {course.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 border-b border-hairline p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[12rem] flex-1">
              <FontAwesomeIcon
                icon={faSearch}
                className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search skills or chapters"
                aria-label="Search skills"
                className="w-full rounded-xl border border-gray-300 bg-surface py-2 pl-9 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={onlySelected}
                onChange={(e) => setOnlySelected(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600/30"
              />
              Selected only
            </label>
            <button
              type="button"
              onClick={detect}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg border border-brand-600/40 bg-brand-600/5 px-3.5 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-600/10 disabled:opacity-60"
            >
              {detecting ? <EcgLoader /> : <FontAwesomeIcon icon={faRobot} className="h-3.5 w-3.5" />}
              Detect with AI
            </button>
          </div>
          {note && (
            <p className="rounded-lg border border-hairline bg-subtle p-2.5 text-xs text-gray-600">{note}</p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {catalog === null ? (
            <p className="flex items-center gap-2 p-4 text-sm text-gray-500">
              <EcgLoader />
              Loading the skills catalog…
            </p>
          ) : groups.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-400">
              {onlySelected ? "No skills selected yet." : "No skills match your search."}
            </p>
          ) : (
            groups.map(([chapter, { area, skills }]) => {
              const picked = skills.filter((s) => selected.has(s.id)).length;
              const expanded = isOpen(chapter, skills);
              return (
                <section key={chapter} className="rounded-xl">
                  <div className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-subtle">
                    <button
                      type="button"
                      onClick={() => toggleChapterOpen(chapter, skills)}
                      aria-expanded={expanded}
                      className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    >
                      <FontAwesomeIcon
                        icon={expanded ? faChevronDown : faChevronRight}
                        className="h-3 w-3 shrink-0 text-gray-400"
                      />
                      <span className="truncate text-sm font-semibold text-gray-800">
                        Chapter {chapter} · {area}
                      </span>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          picked > 0 ? "bg-brand-600/10 text-brand-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {picked}/{skills.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setChapter(skills, picked < skills.length)}
                      disabled={busy}
                      className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-brand-700 hover:bg-brand-600/10 disabled:opacity-50"
                    >
                      {picked < skills.length ? "Select all" : "Clear"}
                    </button>
                  </div>
                  {expanded && (
                    <ul className="mb-1 ml-5 border-l border-hairline pl-2">
                      {skills.map((s) => (
                        <li key={s.id}>
                          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 hover:bg-subtle">
                            <input
                              type="checkbox"
                              checked={selected.has(s.id)}
                              onChange={() => toggle(s.id)}
                              disabled={busy}
                              className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300 text-brand-600 focus:ring-brand-600/30"
                            />
                            <span className="min-w-0 text-sm">
                              <span className="font-mono text-xs text-gray-500">{s.id}</span>{" "}
                              <span className="text-gray-800">{s.title}</span>
                              {reasons[s.id] && (
                                <span className="mt-0.5 flex items-start gap-1.5 text-xs text-brand-700">
                                  <FontAwesomeIcon icon={faRobot} className="mt-0.5 h-3 w-3 shrink-0" />
                                  {reasons[s.id]}
                                </span>
                              )}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-hairline px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg border border-gray-200 bg-surface px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={busy || catalog === null}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700 disabled:opacity-60"
          >
            {saving && <EcgLoader />}
            Save skills
          </button>
        </div>
      </div>
    </div>
  );
}
