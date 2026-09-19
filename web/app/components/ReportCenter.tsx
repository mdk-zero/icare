"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faArrowRight,
  faClockRotateLeft,
  faDownload,
  faEye,
  faFileCsv,
  faFilePdf,
  faSearch,
} from "@fortawesome/free-solid-svg-icons";
import { usePageData } from "../lib/use-page-data";
import {
  fetchRecentReports,
  fetchReport,
  saveBlob,
  type ReportFormat,
} from "../lib/reports/client";
import type { RecentReport } from "../lib/reports/types";
import { timeAgo } from "../faculty/_overview/format";
import ReportPreviewModal, { type PreviewState } from "./ReportPreviewModal";
import { CardLabel } from "./Card";
import { EcgLoader } from "./EcgLoader";
import { toast } from "./Toast";

/* ---------------------------------------------------------------- types */

export type Tone = "rose" | "amber" | "emerald" | "brand" | "slate";

const TONES: Record<Tone, { pill: string; tile: string }> = {
  rose: { pill: "bg-rose-50 text-rose-700", tile: "bg-rose-50 text-rose-600" },
  amber: { pill: "bg-amber-50 text-amber-700", tile: "bg-amber-50 text-amber-600" },
  emerald: { pill: "bg-emerald-50 text-emerald-700", tile: "bg-emerald-50 text-emerald-600" },
  brand: { pill: "bg-brand-600/10 text-brand-700", tile: "bg-brand-600/10 text-brand-600" },
  slate: { pill: "bg-gray-100 text-gray-600", tile: "bg-gray-100 text-gray-500" },
};

/** One thing a report can be about: a student, a section, a room… */
export interface Target {
  id: string;
  label: string;
  sub: string;
  badges?: { text: string; tone: Tone }[];
}

export interface ReportList<T extends Target> {
  /** Undefined until the first load settles. */
  items: T[] | undefined;
  loading: boolean;
  failed: boolean;
  /** Chips beside "All", each counted against what the search and facet leave. */
  filters?: { id: string; label: string; test: (t: T) => boolean }[];
  /** The first is the default. A toggle appears with two or more. */
  sorts?: { id: string; label: string; compare: (a: T, b: T) => number }[];
  /** A select narrowing by one attribute (a section, a role). Shown with two or more options. */
  facet?: {
    label: string;
    options: { id: string; label: string }[];
    valueOf: (t: T) => string | null;
  };
  /** A pinned row for the every-record version of the report, e.g. "All faculty". */
  all?: { label: string };
}

export interface ReportTypeDef<T extends Target = Target> {
  type: string;
  /** "Student" — the panel reads "Student report". */
  label: string;
  icon: IconDefinition;
  blurb: string;
  /** The report's own sections, so nobody has to download one to learn what's in it. */
  contents: string[];
  /** Plural, for search and empty states: "students". */
  noun: string;
  /** Absent for a whole-scope report (roster, admin summary): there's nothing to pick. */
  list?: ReportList<T>;
  /** Whole-scope reports only: what the one report covers. */
  scope?: string;
}

/** Keeps a type's filters and sorts typed against its own targets. */
export function defineReportType<T extends Target>(def: ReportTypeDef<T>): ReportTypeDef {
  return def as unknown as ReportTypeDef;
}

export interface Suggestion {
  id: string;
  icon: IconDefinition;
  tone: Tone;
  title: string;
  detail: string;
  /** The card's call to action: "Review their reports". */
  cta: string;
  action:
    | { kind: "filter"; type: string; filter: string }
    | { kind: "preview"; type: string; targetId: string | null; subject: string };
}

/** Rows rendered before "Show more" — a campus-wide user list runs long. */
const PAGE = 50;

const NO_TARGETS: Target[] = [];

/** "just now", "3h ago", "on Sep 7" — reads after "Pulled" or "Last pulled". */
export function sinceLabel(iso: string): string {
  const text = timeAgo(iso);
  if (text === "Just now") return "just now";
  return text.endsWith(" ago") ? text : `on ${text}`;
}

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable;
}

/* ------------------------------------------------------------ component */

/**
 * The Reports page body, shared by faculty and admin. Each page describes its
 * report types — what to list, how to filter and sort it, what to suggest —
 * and this renders the rest: the type rail, the searchable list, previews,
 * downloads and the caller's recent reports.
 *
 * Every "smart" part is derived from data the page already holds; nothing
 * here calls an AI.
 */
export default function ReportCenter({
  endpoint,
  cachePrefix,
  types,
  suggest,
  historyTypes = [],
  notice,
}: {
  /** "/api/faculty/reports" or "/api/admin/reports". */
  endpoint: string;
  /** Namespaces this page's cache entries: "faculty" or "admin". */
  cachePrefix: string;
  types: ReportTypeDef[];
  /** Undefined `recent` means history is still loading. */
  suggest?: (recent: RecentReport[] | undefined) => Suggestion[];
  /** History entries for reports made elsewhere, e.g. a discharge summary. */
  historyTypes?: { type: string; label: string; icon: IconDefinition }[];
  /** Shown above everything, e.g. "you don't manage any sections yet". */
  notice?: ReactNode;
}) {
  const [activeType, setActiveType] = useState(types[0].type);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [facetValue, setFacetValue] = useState("all");
  const [sortId, setSortId] = useState<string | null>(null);
  const [shown, setShown] = useState(PAGE);
  /** `${type}:${id|all}:${format}` of the download in flight. */
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    type: string;
    targetId: string | null;
    subject: string;
    state: PreviewState;
  } | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The blob on screen in the preview, so "Download PDF" saves it without a
  // second build. Its object URL is made and revoked in handlers rather than
  // effects: strict mode's mount/unmount/mount would revoke a URL still shown.
  const previewFile = useRef<{ blob: Blob; filename: string; url: string } | null>(null);
  // Bumped on every open and close, so a slow build that lands after its
  // preview was closed or replaced is dropped.
  const previewSeq = useRef(0);

  const {
    data: recent,
    refresh: refreshRecent,
  } = usePageData(`${cachePrefix}:reports:recent`, fetchRecentReports);

  const releasePreviewFile = useCallback(() => {
    if (previewFile.current) URL.revokeObjectURL(previewFile.current.url);
    previewFile.current = null;
  }, []);

  useEffect(() => releasePreviewFile, [releasePreviewFile]);

  // "/" jumps to search, as in most list-heavy tools.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (document.querySelector('[aria-modal="true"]') || !searchRef.current) return;
      e.preventDefault();
      searchRef.current.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  /* --- derived ------------------------------------------------------- */

  const active = types.find((t) => t.type === activeType) ?? types[0];
  const list = active.list;
  const items = list?.items ?? NO_TARGETS;
  const q = search.trim().toLowerCase();
  const matches = (t: Target) =>
    !q || t.label.toLowerCase().includes(q) || t.sub.toLowerCase().includes(q);

  const facet = list?.facet && list.facet.options.length > 1 ? list.facet : null;
  const base = items.filter(
    (t) => matches(t) && (!facet || facetValue === "all" || facet.valueOf(t) === facetValue),
  );
  const activeFilter = list?.filters?.find((f) => f.id === filter);
  const sort = list?.sorts?.find((s) => s.id === sortId) ?? list?.sorts?.[0];
  const filtered = activeFilter ? base.filter(activeFilter.test) : base;
  const visible = sort ? [...filtered].sort(sort.compare) : filtered;
  const narrowed = Boolean(q) || filter !== "all" || (facet !== null && facetValue !== "all");

  // Nothing here matches the search — but it may be a name from another list.
  const elsewhere: { def: ReportTypeDef; hits: Target[] }[] = [];
  if (q && visible.length === 0) {
    const seen = new Set<Target[]>([items]);
    for (const def of types) {
      const other = def.list?.items;
      if (!other || seen.has(other)) continue;
      seen.add(other);
      const hits = other.filter(matches);
      if (hits.length > 0) elsewhere.push({ def, hits });
    }
  }

  const describe = (type: string) =>
    types.find((t) => t.type === type) ?? historyTypes.find((t) => t.type === type) ?? null;

  const history = (recent ?? []).filter((r) => describe(r.type) !== null);
  const lastPulled = (type: string, targetId: string | null) =>
    history.find((r) => r.type === type && r.target_id === targetId);

  const suggestions = (suggest?.(recent) ?? []).slice(0, 3);

  /* --- actions ------------------------------------------------------- */

  const selectType = (type: string) => {
    setActiveType(type);
    setFilter("all");
    setFacetValue("all");
    setSortId(null);
    setShown(PAGE);
  };

  const busyFormat = (type: string, targetId: string | null): ReportFormat | null => {
    const prefix = `${type}:${targetId ?? "all"}:`;
    return busy?.startsWith(prefix) ? (busy.slice(prefix.length) as ReportFormat) : null;
  };

  const download = async (type: string, targetId: string | null, format: ReportFormat) => {
    setBusy(`${type}:${targetId ?? "all"}:${format}`);
    const result = await fetchReport(endpoint, type, targetId, format);
    setBusy(null);
    if ("error" in result) {
      toast(result.error, "error");
      return;
    }
    saveBlob(result.blob, result.filename);
    toast(`Downloaded ${result.filename}`);
    void refreshRecent();
  };

  const openPreview = (type: string, targetId: string | null, subject: string) => {
    releasePreviewFile();
    const seq = ++previewSeq.current;
    setPreview({ type, targetId, subject, state: { status: "loading" } });
    void fetchReport(endpoint, type, targetId, "pdf").then((result) => {
      if (seq !== previewSeq.current) return;
      if ("error" in result) {
        setPreview((p) => p && { ...p, state: { status: "error", error: result.error } });
        return;
      }
      const url = URL.createObjectURL(result.blob);
      previewFile.current = { ...result, url };
      setPreview((p) => p && { ...p, state: { status: "ready", url } });
      void refreshRecent();
    });
  };

  const closePreview = useCallback(() => {
    previewSeq.current += 1;
    releasePreviewFile();
    setPreview(null);
  }, [releasePreviewFile]);

  const downloadFromPreview = (format: ReportFormat) => {
    if (!preview) return;
    const file = previewFile.current;
    if (format === "pdf" && file) {
      saveBlob(file.blob, file.filename);
      toast(`Downloaded ${file.filename}`);
      return;
    }
    void download(preview.type, preview.targetId, format);
  };

  const runSuggestion = (s: Suggestion) => {
    if (s.action.kind === "preview") {
      openPreview(s.action.type, s.action.targetId, s.action.subject);
      return;
    }
    selectType(s.action.type);
    setFilter(s.action.filter);
    setSearch("");
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  /* --- pieces -------------------------------------------------------- */

  const actions = (type: string, targetId: string | null, subject: string, primary = false) => {
    const pending = busyFormat(type, targetId);
    const formatButton = (format: ReportFormat) => (
      <button
        type="button"
        onClick={() => void download(type, targetId, format)}
        disabled={busy !== null}
        title={`Download ${format.toUpperCase()}`}
        aria-label={`Download ${subject} as ${format.toUpperCase()}`}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50"
      >
        {pending === format ? (
          <EcgLoader />
        ) : (
          <FontAwesomeIcon
            icon={format === "pdf" ? faFilePdf : faFileCsv}
            className="h-3.5 w-3.5 text-gray-400"
          />
        )}
        {format.toUpperCase()}
      </button>
    );
    return (
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => openPreview(type, targetId, subject)}
          aria-label={`Preview ${subject}`}
          className={
            primary
              ? "inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-colors hover:bg-brand-700"
              : "inline-flex items-center gap-1.5 rounded-lg border border-brand-600/30 px-3 py-1.5 text-sm font-medium text-brand-700 transition-colors hover:bg-brand-50"
          }
        >
          <FontAwesomeIcon icon={faEye} className="h-3.5 w-3.5" />
          Preview
        </button>
        {formatButton("pdf")}
        {formatButton("csv")}
      </div>
    );
  };

  const pulledNote = (type: string, targetId: string | null) => {
    const last = lastPulled(type, targetId);
    return last ? `Pulled ${sinceLabel(last.created_at)}` : null;
  };

  const row = (t: Target, key: string, targetId: string | null) => {
    const pulled = pulledNote(active.type, targetId);
    return (
      <li
        key={key}
        className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-subtle sm:flex-row sm:items-center sm:gap-4 sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate font-semibold text-gray-800">{t.label}</p>
            {t.badges?.map((b) => (
              <span
                key={b.text}
                className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TONES[b.tone].pill}`}
              >
                {b.text}
              </span>
            ))}
          </div>
          <p className="truncate text-xs text-gray-500">
            {t.sub}
            {pulled && <span className="text-gray-400"> · {pulled}</span>}
          </p>
        </div>
        {actions(active.type, targetId, t.label)}
      </li>
    );
  };

  /* --- render -------------------------------------------------------- */

  const previewDef = preview ? describe(preview.type) : null;

  return (
    <>
      {notice}

      {suggestions.length > 0 && (
        <section aria-label="Suggested reports" className="mb-4">
          <CardLabel>Suggested</CardLabel>
          <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => runSuggestion(s)}
                className="group flex items-start gap-3 rounded-xl border border-hairline bg-surface p-4 text-left shadow-tile transition-all hover:border-brand-300 hover:shadow-tile-hover"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${TONES[s.tone].tile}`}
                >
                  <FontAwesomeIcon icon={s.icon} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-gray-900">{s.title}</span>
                  <span className="mt-0.5 block text-sm text-gray-500">{s.detail}</span>
                  <span className="mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 group-hover:text-brand-700">
                    {s.cta}
                    <FontAwesomeIcon
                      icon={faArrowRight}
                      className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
                    />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:grid-rows-[auto_1fr]">
        {/* Type rail: scrollable chips on a phone, a list beside the panel on a desk. */}
        <nav
          aria-label="Report type"
          className="min-w-0 lg:self-start lg:rounded-xl lg:border lg:border-hairline lg:bg-surface lg:p-2 lg:shadow-tile"
        >
          <p className="hidden px-2.5 pb-2 pt-1 lg:block">
            <CardLabel>Report type</CardLabel>
          </p>
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-1 lg:mx-0 lg:flex-col lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0">
            {types.map((t) => {
              const selected = t.type === active.type;
              const count = t.list?.items?.length;
              return (
                <button
                  key={t.type}
                  type="button"
                  onClick={() => {
                    selectType(t.type);
                    setSearch("");
                  }}
                  aria-current={selected ? "true" : undefined}
                  className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors lg:w-full ${
                    selected
                      ? "bg-brand-600 font-semibold text-white lg:bg-brand-600/10 lg:text-brand-700"
                      : "border border-hairline bg-surface text-gray-600 hover:text-gray-900 lg:border-transparent lg:bg-transparent lg:hover:bg-subtle"
                  }`}
                >
                  <FontAwesomeIcon
                    icon={t.icon}
                    className={`h-3.5 w-3.5 ${selected ? "lg:text-brand-600" : "text-gray-400"}`}
                  />
                  <span className="lg:flex-1 lg:text-left">{t.label}</span>
                  {count !== undefined && (
                    <span
                      className={`text-xs tabular-nums ${selected ? "opacity-80" : "text-gray-400"}`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </nav>

        {/* The selected type. */}
        <div
          ref={panelRef}
          className="min-w-0 scroll-mt-4 overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile lg:row-span-2"
        >
          <div className="border-b border-hairline p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-600/10">
                <FontAwesomeIcon icon={active.icon} className="h-4 w-4 text-brand-600" />
              </span>
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold text-gray-900">
                  {active.label} report
                </h2>
                <p className="text-sm text-gray-500">{active.blurb}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="mr-0.5 text-xs font-medium text-gray-400">Includes</span>
              {active.contents.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-subtle px-2 py-0.5 text-xs text-gray-600 ring-1 ring-hairline"
                >
                  {c}
                </span>
              ))}
            </div>
          </div>

          {!list ? (
            <div className="px-4 py-10 text-center sm:px-5">
              {active.scope && <p className="text-sm text-gray-600">{active.scope}</p>}
              {pulledNote(active.type, null) && (
                <p className="mt-1 text-xs text-gray-400">{pulledNote(active.type, null)}</p>
              )}
              <div className="mt-5 flex justify-center">
                {actions(active.type, null, active.label, true)}
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-3 border-b border-hairline p-4 sm:px-5">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[12rem] flex-1">
                    <FontAwesomeIcon
                      icon={faSearch}
                      className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      ref={searchRef}
                      type="search"
                      placeholder={`Search ${active.noun}…`}
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setShown(PAGE);
                      }}
                      aria-label={`Search ${active.noun}`}
                      className="w-full rounded-lg border border-gray-300 bg-surface py-2 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                    />
                    <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-hairline bg-subtle px-1.5 font-mono text-[11px] text-gray-400 sm:block">
                      /
                    </kbd>
                  </div>

                  {facet && (
                    <select
                      value={facetValue}
                      onChange={(e) => {
                        setFacetValue(e.target.value);
                        setShown(PAGE);
                      }}
                      aria-label={facet.label}
                      className="rounded-lg border border-gray-300 bg-surface py-2 pl-3 pr-8 text-sm text-gray-700 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
                    >
                      <option value="all">All {facet.label.toLowerCase()}s</option>
                      {facet.options.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  )}

                  {list.sorts && list.sorts.length > 1 && (
                    <div
                      role="group"
                      aria-label="Sort"
                      className="flex rounded-lg border border-hairline p-0.5"
                    >
                      {list.sorts.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSortId(s.id)}
                          aria-pressed={sort?.id === s.id}
                          className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                            sort?.id === s.id
                              ? "bg-brand-600 text-white"
                              : "text-gray-500 hover:bg-subtle hover:text-gray-900"
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {list.filters && list.filters.length > 0 && (
                  <div role="group" aria-label="Filter" className="flex flex-wrap gap-1.5">
                    {[{ id: "all", label: "All", count: base.length }, ...list.filters.map((f) => ({
                      id: f.id,
                      label: f.label,
                      count: base.filter(f.test).length,
                    }))].map((chip) => {
                      const on = filter === chip.id;
                      return (
                        <button
                          key={chip.id}
                          type="button"
                          onClick={() => {
                            setFilter(chip.id);
                            setShown(PAGE);
                          }}
                          aria-pressed={on}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                            on
                              ? "bg-brand-600 text-white"
                              : "bg-subtle text-gray-600 ring-1 ring-hairline hover:text-gray-900"
                          }`}
                        >
                          {chip.label}
                          <span className={`tabular-nums ${on ? "opacity-80" : "text-gray-400"}`}>
                            {chip.count}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {list.items === undefined && list.loading ? (
                <ul className="divide-y divide-hairline" aria-hidden>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <li key={i} className="flex animate-pulse items-center gap-4 px-4 py-4 sm:px-5">
                      <div className="flex-1 space-y-2">
                        <div className="h-4 w-1/3 rounded bg-gray-200" />
                        <div className="h-3 w-1/2 rounded bg-gray-100" />
                      </div>
                      <div className="h-7 w-40 rounded bg-gray-100" />
                    </li>
                  ))}
                </ul>
              ) : list.failed && items.length === 0 ? (
                <p className="px-4 py-10 text-center text-sm text-rose-700 sm:px-5">
                  Unable to load the {active.noun}. Refresh the page to try again.
                </p>
              ) : (
                <ul className="divide-y divide-hairline">
                  {list.all && !narrowed && items.length > 0 && (
                    <li className="flex flex-col gap-2 bg-subtle px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-gray-800">{list.all.label}</p>
                        <p className="text-xs text-gray-500">
                          One report covering all {items.length} {active.noun}
                          {pulledNote(active.type, null) && (
                            <span className="text-gray-400"> · {pulledNote(active.type, null)}</span>
                          )}
                        </p>
                      </div>
                      {actions(active.type, null, list.all.label)}
                    </li>
                  )}

                  {visible.slice(0, shown).map((t) => row(t, t.id, t.id))}

                  {visible.length === 0 && (
                    <li className="px-4 py-10 text-center sm:px-5">
                      <p className="text-sm text-gray-500">
                        {items.length === 0
                          ? `No ${active.noun} yet.`
                          : `No ${active.noun} match${q ? ` “${search.trim()}”` : " this filter"}.`}
                      </p>
                      {elsewhere.length > 0 && (
                        <div className="mt-3 flex flex-wrap justify-center gap-2">
                          {elsewhere.map(({ def, hits }) => (
                            <button
                              key={def.type}
                              type="button"
                              onClick={() => selectType(def.type)}
                              className="inline-flex items-center gap-2 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm text-gray-700 transition-colors hover:border-brand-300 hover:text-brand-700"
                            >
                              <FontAwesomeIcon icon={def.icon} className="h-3.5 w-3.5 text-gray-400" />
                              {hits.length === 1
                                ? `${hits[0].label} in ${def.label}`
                                : `${hits.length} matches in ${def.label}`}
                              <FontAwesomeIcon icon={faArrowRight} className="h-3 w-3 text-gray-400" />
                            </button>
                          ))}
                        </div>
                      )}
                    </li>
                  )}
                </ul>
              )}

              {visible.length > shown && (
                <div className="border-t border-hairline px-4 py-3 text-center sm:px-5">
                  <button
                    type="button"
                    onClick={() => setShown((n) => n + PAGE)}
                    className="text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    Show {Math.min(PAGE, visible.length - shown)} more of {visible.length - shown}
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        {/* Recent — read back from the audit trail, so it follows you across devices. */}
        <section
          aria-labelledby="recent-reports"
          className="min-w-0 self-start overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile lg:col-start-1"
        >
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
            <FontAwesomeIcon icon={faClockRotateLeft} className="h-3.5 w-3.5 text-gray-400" />
            <h3 id="recent-reports" className="text-sm font-semibold text-gray-900">
              Recent
            </h3>
          </div>
          {recent === undefined ? (
            <div className="animate-pulse space-y-3 p-4" aria-hidden>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <div className="h-3.5 w-3/4 rounded bg-gray-200" />
                  <div className="h-3 w-1/2 rounded bg-gray-100" />
                </div>
              ))}
            </div>
          ) : history.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-400">
              Reports you generate show up here, on any device.
            </p>
          ) : (
            <ul className="divide-y divide-hairline">
              {history.map((r) => {
                const def = describe(r.type)!;
                const pending = busyFormat(r.type, r.target_id) === r.format;
                return (
                  <li key={`${r.type}:${r.target_id ?? "all"}`} className="flex items-center gap-1 px-2 py-1.5">
                    <button
                      type="button"
                      onClick={() => openPreview(r.type, r.target_id, r.subject)}
                      title="Preview"
                      className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-subtle"
                    >
                      <FontAwesomeIcon icon={def.icon} className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-gray-800">
                          {r.subject}
                        </span>
                        <span className="block truncate text-xs text-gray-400">
                          {def.label} · {r.format.toUpperCase()} · {timeAgo(r.created_at)}
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void download(r.type, r.target_id, r.format)}
                      disabled={busy !== null}
                      title={`Generate this ${r.format.toUpperCase()} again`}
                      aria-label={`Generate ${r.subject} ${r.format.toUpperCase()} again`}
                      className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-subtle hover:text-brand-600 disabled:opacity-50"
                    >
                      {pending ? <EcgLoader /> : <FontAwesomeIcon icon={faDownload} className="h-3.5 w-3.5" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {preview && (
        <ReportPreviewModal
          icon={previewDef?.icon ?? active.icon}
          kind={`${previewDef?.label ?? "Report"} report`}
          subject={preview.subject}
          state={preview.state}
          downloading={busyFormat(preview.type, preview.targetId)}
          onDownload={downloadFromPreview}
          onRetry={() => openPreview(preview.type, preview.targetId, preview.subject)}
          onClose={closePreview}
        />
      )}
    </>
  );
}
