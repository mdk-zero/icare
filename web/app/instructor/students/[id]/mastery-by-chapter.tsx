"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCaretDown, faCaretUp, faChevronDown, faCircleCheck, faMinus } from "@fortawesome/free-solid-svg-icons";
import { MASTERY_THRESHOLD, masteryPercent } from "../../../lib/bkt";
import type { SkillMasteryHistory } from "../../../lib/mastery-history";

const THRESHOLD_PCT = Math.round(MASTERY_THRESHOLD * 100);
/** Chapters listed before "Show all". */
const FIRST_ROWS = 5;

type ChartPoint = { day: string; value: number; detail: string };
type ChapterGroup = { chapter: number; area: string; skills: SkillMasteryHistory[] };

const dayTime = (day: string) => Date.parse(`${day}T00:00:00+08:00`);
const dayLabel = (day: string, withYear = false) =>
  new Date(`${day}T00:00:00+08:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "Asia/Manila",
  });
/** "Assessing Body Temperature (Skill 1-1)" → "Assessing Body Temperature" */
const shortTitle = (title: string) => title.replace(/\s*\(Skill [\d-]+\)\s*$/, "");
const skillNumber = (id: string) => Number(id.split("-")[1]) || 0;

/** The average across the given skills by each day, a skill counting from its first day on. */
function averageSeries(skills: SkillMasteryHistory[]): ChartPoint[] {
  const days = [...new Set(skills.flatMap((s) => s.points.map((p) => p.day)))].sort();
  const cursor = skills.map(() => -1);
  return days.map((day) => {
    let sum = 0;
    let started = 0;
    let mastered = 0;
    skills.forEach((s, k) => {
      while (cursor[k] + 1 < s.points.length && s.points[cursor[k] + 1].day <= day) cursor[k]++;
      if (cursor[k] < 0) return;
      const m = s.points[cursor[k]].mastery;
      sum += m;
      started++;
      if (m >= MASTERY_THRESHOLD) mastered++;
    });
    return { day, value: sum / started, detail: `${mastered} of ${started} skill${started === 1 ? "" : "s"} mastered` };
  });
}

const skillSeries = (s: SkillMasteryHistory): ChartPoint[] =>
  s.points.map((p) => ({ day: p.day, value: p.mastery, detail: `${p.correct} of ${p.answers} right that day` }));

function byChapter(skills: SkillMasteryHistory[]): ChapterGroup[] {
  const groups = new Map<number, ChapterGroup>();
  for (const s of skills) {
    const group = groups.get(s.chapter) ?? { chapter: s.chapter, area: s.area, skills: [] };
    group.skills.push(s);
    groups.set(s.chapter, group);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, skills: [...g.skills].sort((a, b) => skillNumber(a.skill_id) - skillNumber(b.skill_id)) }))
    .sort((a, b) => a.chapter - b.chapter);
}

/**
 * One student's skill mastery over time, as they see it on their own Profile:
 * the average across their skills, then each chapter with its trend, which
 * opens to its chart and its skills, and each skill to its own chart.
 */
export default function MasteryByChapter({ skills, loading }: { skills: SkillMasteryHistory[] | null; loading: boolean }) {
  const average = useMemo(() => averageSeries(skills ?? []), [skills]);
  const chapters = useMemo(() => byChapter(skills ?? []), [skills]);
  const [openChapter, setOpenChapter] = useState<number | null>(null);
  const [openSkill, setOpenSkill] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (loading && !skills) {
    return (
      <div className="space-y-3" aria-hidden>
        <div className="h-48 animate-pulse rounded-xl bg-gray-100" />
        <div className="h-14 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-gray-900">Skill mastery</h3>
        <span className="text-xs text-gray-500">{THRESHOLD_PCT}% = mastered</span>
      </div>

      {!skills ? (
        <p className="py-4 text-center text-sm text-gray-400">Skill mastery couldn&apos;t be loaded. Refresh to try again.</p>
      ) : skills.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">Nothing yet. It starts with this student&apos;s first quiz or graded checklist.</p>
      ) : (
        <div className="space-y-3">
          <div className="rounded-xl border border-hairline p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-900">Average mastery</p>
                <p className="text-xs text-gray-500">
                  Across {skills.length} skill{skills.length === 1 ? "" : "s"}
                </p>
              </div>
              <Now value={average[average.length - 1].value} first={average[0].value} count={average.length} big />
            </div>
            <MasteryChart points={average} height={170} label="Average mastery" />
          </div>

          <ul className="overflow-hidden rounded-xl border border-hairline">
            {(showAll ? chapters : chapters.slice(0, FIRST_ROWS)).map((g, i) => {
              const open = openChapter === g.chapter;
              const points = averageSeries(g.skills);
              const mastered = g.skills.filter((s) => s.mastery >= MASTERY_THRESHOLD).length;
              return (
                <li key={g.chapter} className={i > 0 ? "border-t border-hairline" : ""}>
                  <TrendRow
                    eyebrow={`Chapter ${g.chapter}`}
                    title={g.area || `Chapter ${g.chapter}`}
                    points={points}
                    allMastered={mastered === g.skills.length}
                    open={open}
                    onToggle={() => {
                      setOpenChapter(open ? null : g.chapter);
                      setOpenSkill(null);
                    }}
                  />
                  {open && (
                    <div className="space-y-3 px-4 pb-4">
                      <p className="text-xs text-gray-500">
                        {mastered} of {g.skills.length} skill{g.skills.length === 1 ? "" : "s"} mastered
                      </p>
                      <MasteryChart points={points} height={150} label={`Chapter ${g.chapter}, ${g.area}`} />
                      <ul className="overflow-hidden rounded-lg border border-hairline">
                        {g.skills.map((s, j) => {
                          const skillOpen = openSkill === s.skill_id;
                          return (
                            <li key={s.skill_id} className={j > 0 ? "border-t border-hairline" : ""}>
                              <TrendRow
                                eyebrow={`Skill ${s.skill_id}`}
                                title={shortTitle(s.title)}
                                points={skillSeries(s)}
                                allMastered={s.mastery >= MASTERY_THRESHOLD}
                                open={skillOpen}
                                compact
                                onToggle={() => setOpenSkill(skillOpen ? null : s.skill_id)}
                              />
                              {skillOpen && (
                                <div className="px-3 pb-3">
                                  <MasteryChart points={skillSeries(s)} height={140} label={`Skill ${s.skill_id}`} />
                                  <p className="mt-1 text-xs text-gray-500">
                                    {s.mastery >= MASTERY_THRESHOLD
                                      ? "Mastered."
                                      : `${THRESHOLD_PCT - masteryPercent(s.mastery)} points to mastered.`}{" "}
                                    From {s.answers} answer{s.answers === 1 ? "" : "s"} on quizzes and checklists.
                                  </p>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </li>
              );
            })}
            {chapters.length > FIRST_ROWS && (
              <li className="border-t border-hairline">
                <button
                  type="button"
                  onClick={() => setShowAll((v) => !v)}
                  className="w-full py-3 text-sm font-semibold text-brand-700 hover:bg-subtle"
                >
                  {showAll ? "Show fewer chapters" : `Show all ${chapters.length} chapters`}
                </button>
              </li>
            )}
          </ul>
        </div>
      )}
    </section>
  );
}

/** Mastery now, with the change since the first day. */
function Now({ value, first, count, big }: { value: number; first: number; count: number; big?: boolean }) {
  const now = masteryPercent(value);
  const change = now - masteryPercent(first);
  return (
    <div className="shrink-0 text-right">
      <p
        className={`font-bold tabular-nums ${big ? "text-2xl" : "text-base"} ${value >= MASTERY_THRESHOLD ? "text-emerald-700" : "text-gray-900"}`}
      >
        {now}%
      </p>
      {count > 1 && (
        <p
          className={`flex items-center justify-end gap-1 text-xs font-semibold tabular-nums ${
            change > 0 ? "text-emerald-700" : change < 0 ? "text-red-700" : "text-gray-400"
          }`}
        >
          <FontAwesomeIcon icon={change > 0 ? faCaretUp : change < 0 ? faCaretDown : faMinus} className="h-2.5 w-2.5" />
          {change > 0 ? "+" : ""}
          {change}
        </p>
      )}
    </div>
  );
}

function TrendRow({
  eyebrow,
  title,
  points,
  allMastered,
  open,
  compact,
  onToggle,
}: {
  eyebrow: string;
  title: string;
  points: ChartPoint[];
  allMastered: boolean;
  open: boolean;
  compact?: boolean;
  onToggle: () => void;
}) {
  const last = points[points.length - 1].value;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`flex w-full items-center gap-3 text-left transition-colors hover:bg-subtle ${compact ? "px-3 py-2.5" : "px-4 py-3"}`}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-xs font-semibold text-brand-700">
          {eyebrow}
          {allMastered && <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3 text-emerald-600" />}
        </span>
        <span className={`block truncate font-semibold text-gray-900 ${compact ? "text-sm" : ""}`}>{title}</span>
      </span>
      <Sparkline points={points} mastered={allMastered} />
      <span className="w-14">
        <Now value={last} first={points[0].value} count={points.length} />
      </span>
      <FontAwesomeIcon
        icon={faChevronDown}
        className={`h-3 w-3 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
      />
    </button>
  );
}

/** A small trend, scaled to its own range (at least 25 points) so its shape shows. */
function Sparkline({ points, mastered }: { points: ChartPoint[]; mastered: boolean }) {
  const W = 64;
  const H = 28;
  const values = points.map((p) => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(0.25, hi - lo);
  const base = (lo + hi) / 2 - span / 2;
  const times = points.map((p) => dayTime(p.day));
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const x = (i: number) => (t1 === t0 ? W / 2 : 2 + ((times[i] - t0) / (t1 - t0)) * (W - 6));
  const y = (v: number) => 3 + (1 - (v - base) / span) * (H - 6);
  const d = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} aria-hidden className={`shrink-0 ${mastered ? "text-emerald-600" : "text-brand-600"}`}>
      {points.length > 1 && <path d={d} fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />}
      <circle cx={x(points.length - 1)} cy={y(values[values.length - 1])} r={2.5} fill="currentColor" />
    </svg>
  );
}

/** A mastery line over time on a 0–100% scale, with the mastered line; hover reads a day. */
function MasteryChart({ points, height, label }: { points: ChartPoint[]; height: number; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  // Drawn at the width it is shown, so its text stays the size it was set at.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(560);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(240, el.clientWidth));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const W = width;
  const H = height;
  const PAD = { left: 34, right: 10, top: 14, bottom: 22 };
  const times = points.map((p) => dayTime(p.day));
  const t0 = times[0];
  const t1 = times[times.length - 1];
  const x = (i: number) =>
    points.length === 1 || t1 === t0 ? (PAD.left + W - PAD.right) / 2 : PAD.left + ((times[i] - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - v) * (H - PAD.top - PAD.bottom);
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(points.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const at = hover ?? points.length - 1;
  const sel = points[at];

  return (
    <div ref={box}>
      <p className="mt-2 rounded-lg bg-subtle px-3 py-1.5 text-xs text-gray-600" aria-live="polite">
        <span className="font-semibold text-gray-700">{dayLabel(sel.day, true)}</span>{" "}
        <span className="text-sm font-bold tabular-nums text-gray-900">{masteryPercent(sel.value)}%</span>{" "}
        {sel.detail}
      </p>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        className="mt-1 block text-brand-600"
        role="img"
        aria-label={`${label}: ${masteryPercent(points[0].value)}% on ${dayLabel(points[0].day, true)}, ${masteryPercent(points[points.length - 1].value)}% now.`}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`fill-${label.replace(/\W/g, "")}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity={0.18} />
            <stop offset="1" stopColor="currentColor" stopOpacity={0} />
          </linearGradient>
        </defs>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} className="stroke-gray-100" />
            <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" className="fill-gray-400 text-[10px]">
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}
        <line
          x1={PAD.left}
          x2={W - PAD.right}
          y1={y(MASTERY_THRESHOLD)}
          y2={y(MASTERY_THRESHOLD)}
          className="stroke-emerald-600"
          strokeDasharray="5 4"
        />
        <text x={PAD.left + 4} y={y(MASTERY_THRESHOLD) - 4} className="fill-emerald-700 text-[10px] font-semibold">
          Mastered at {THRESHOLD_PCT}%
        </text>
        <g>
          {points.length > 1 && <path d={area} fill={`url(#fill-${label.replace(/\W/g, "")})`} />}
          {points.length > 1 && (
            <path d={line} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinejoin="round" strokeLinecap="round" />
          )}
          <line x1={x(at)} x2={x(at)} y1={PAD.top} y2={y(0)} stroke="currentColor" strokeOpacity={0.25} />
          {points.map((p, i) => (
            <g key={p.day}>
              <circle cx={x(i)} cy={y(p.value)} r={i === at ? 5 : 3} fill={i === at ? "var(--color-surface, #fff)" : "currentColor"} stroke="currentColor" strokeWidth={i === at ? 2.5 : 0} />
              <circle cx={x(i)} cy={y(p.value)} r={11} fill="transparent" onMouseEnter={() => setHover(i)} />
            </g>
          ))}
        </g>
        {[0, points.length - 1].filter((v, i, a) => a.indexOf(v) === i).map((i, k) => (
          <text
            key={i}
            x={x(i)}
            y={H - 6}
            textAnchor={points.length === 1 ? "middle" : k === 0 ? "start" : "end"}
            className="fill-gray-400 text-[10px]"
          >
            {dayLabel(points[i].day)}
          </text>
        ))}
      </svg>
    </div>
  );
}
