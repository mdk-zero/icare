"use client";

import type { CSSProperties, ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";
import {
  ACTIVE_CHAPTERS,
  TAYLORS_CHAPTERS,
  type TaylorsChapter,
} from "../../../scripts/taylors-chapters";

/** The Taylor's chapters the app teaches, which a library is built around. */
export const TAUGHT_CHAPTERS = TAYLORS_CHAPTERS.filter((c) => ACTIVE_CHAPTERS.includes(c.chapter));

/**
 * One chart-series hue per taught chapter (already stepped for dark mode in
 * globals.css): red for vital signs, blue for oxygen, green for fluids.
 */
const CHAPTER_HUE: Record<number, string> = {
  1: "var(--color-series-8)",
  14: "var(--color-series-1)",
  15: "var(--color-series-3)",
};

export function chapterHue(chapter: number | undefined): string {
  return (chapter && CHAPTER_HUE[chapter]) || "var(--color-brand-500)";
}

/** `--hue` for the arbitrary-value classes below (tints via color-mix). */
export function hueStyle(chapter: number | undefined): CSSProperties {
  return { "--hue": chapterHue(chapter) } as CSSProperties;
}

export function chapterName(chapter: number | undefined): string {
  return TAUGHT_CHAPTERS.find((c) => c.chapter === chapter)?.name ?? "";
}

/** "Body temperature, …" from "Taylor's Chapter 1 (Skills …): body temperature, …". */
function chapterSummary(c: TaylorsChapter): string {
  const body = c.description.replace(/^[^:]*:\s*/, "");
  return body.charAt(0).toUpperCase() + body.slice(1);
}

/** A numbered section of the build sheet. */
export function Step({
  n,
  title,
  hint,
  children,
}: {
  n: number;
  title: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="grid grid-cols-[2rem_1fr] gap-x-3">
      <span
        aria-hidden
        className="font-display text-[13px] font-semibold tabular-nums text-brand-600 pt-0.5"
      >
        {String(n).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
        {hint && <p className="text-xs text-gray-500 mt-0.5">{hint}</p>}
        <div className="mt-3">{children}</div>
      </div>
    </section>
  );
}

/** A taught chapter as a toggle card: big numeral in the chapter's hue. */
export function ChapterCard({
  chapter,
  selected,
  disabled,
  onToggle,
}: {
  chapter: TaylorsChapter;
  selected: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={selected}
      style={hueStyle(chapter.chapter)}
      className={`group relative flex flex-col text-left rounded-xl border p-3.5 transition-all disabled:opacity-50 ${
        selected
          ? "border-[var(--hue)] bg-[color-mix(in_srgb,var(--hue)_7%,transparent)] shadow-[0_0_0_1px_var(--hue)]"
          : "border-hairline bg-surface hover:border-[color-mix(in_srgb,var(--hue)_55%,transparent)]"
      }`}
    >
      <span className="flex items-start justify-between">
        <span className="font-display text-4xl font-semibold leading-none tabular-nums text-[var(--hue)]">
          {chapter.chapter}
        </span>
        <span
          aria-hidden
          className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
            selected
              ? "bg-[var(--hue)] border-[var(--hue)] text-white"
              : "border-gray-300 text-transparent group-hover:border-[var(--hue)]"
          }`}
        >
          <FontAwesomeIcon icon={faCheck} className="w-2.5 h-2.5" />
        </span>
      </span>
      <span className="mt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-gray-500">
        Chapter {chapter.chapter} · {chapter.skills} skills
      </span>
      <span className="mt-0.5 text-sm font-semibold text-gray-900 leading-snug">{chapter.name}</span>
      <span className="mt-1.5 text-xs text-gray-500 line-clamp-3">{chapterSummary(chapter)}</span>
    </button>
  );
}

const TILE_CAP = 24;

/**
 * One tile per planned case, coloured by the chapter it will be built around,
 * in the order the batch cycles through them. `filled` lights tiles up as
 * cases come back while generating.
 */
export function PlanStrip({
  sequence,
  filled,
  size = "md",
}: {
  sequence: (number | undefined)[];
  filled?: number;
  size?: "md" | "lg";
}) {
  const shown = sequence.slice(0, TILE_CAP);
  const extra = sequence.length - shown.length;
  const tile = size === "lg" ? "h-7" : "h-5";
  return (
    <div className="grid grid-cols-8 gap-1" aria-hidden>
      {shown.map((chapter, i) => {
        const lit = filled === undefined || i < filled;
        return (
          <span
            key={i}
            style={{ ...hueStyle(chapter), animationDelay: `${i * 18}ms` }}
            className={`${tile} rounded-[5px] animate-rise transition-colors duration-500 ${
              lit
                ? "bg-[var(--hue)]"
                : "bg-[color-mix(in_srgb,var(--hue)_16%,transparent)] border border-dashed border-[color-mix(in_srgb,var(--hue)_45%,transparent)]"
            }`}
          />
        );
      })}
      {extra > 0 && (
        <span
          className={`${tile} col-span-2 rounded-[5px] bg-subtle border border-hairline text-[10px] font-semibold text-gray-500 flex items-center justify-center tabular-nums`}
        >
          +{extra}
        </span>
      )}
    </div>
  );
}

/** Legend under the strip: each chapter with how many cases it gets. */
export function PlanLegend({ sequence }: { sequence: (number | undefined)[] }) {
  const counts = new Map<number, number>();
  for (const c of sequence) if (c) counts.set(c, (counts.get(c) ?? 0) + 1);
  return (
    <ul className="space-y-1.5">
      {[...counts].map(([chapter, n]) => (
        <li key={chapter} className="flex items-center gap-2 text-xs" style={hueStyle(chapter)}>
          <span className="w-2.5 h-2.5 rounded-sm bg-[var(--hue)] shrink-0" />
          <span className="text-gray-700 truncate flex-1">{chapterName(chapter)}</span>
          <span className="tabular-nums font-semibold text-gray-900">{n}</span>
        </li>
      ))}
    </ul>
  );
}

/** Three small rooms of four beds, packed or spread, drawn to explain the choice. */
function RoomDiagram({ mode }: { mode: "fill" | "spread" }) {
  const beds = mode === "fill" ? [4, 2, 0] : [2, 2, 2];
  return (
    <span className="flex gap-1" aria-hidden>
      {beds.map((taken, r) => (
        <span key={r} className="grid grid-cols-2 gap-[2px] p-[3px] rounded-[4px] border border-gray-300">
          {Array.from({ length: 4 }, (_, b) => (
            <span
              key={b}
              className={`w-[5px] h-[5px] rounded-[1.5px] ${b < taken ? "bg-brand-600" : "bg-gray-200"}`}
            />
          ))}
        </span>
      ))}
    </span>
  );
}

export function RoomModeCard({
  mode,
  title,
  hint,
  selected,
  disabled,
  onSelect,
}: {
  mode: "fill" | "spread";
  title: string;
  hint: string;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      disabled={disabled}
      className={`flex-1 flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-all disabled:opacity-50 ${
        selected
          ? "border-brand-600 bg-brand-50 shadow-[0_0_0_1px_var(--color-brand-600)]"
          : "border-hairline bg-surface hover:border-brand-300"
      }`}
    >
      <RoomDiagram mode={mode} />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-800">{title}</span>
        <span className="block text-xs text-gray-500">{hint}</span>
      </span>
    </button>
  );
}
