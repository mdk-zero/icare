"use client";

import { useEffect, useRef, useState } from "react";
import { MASTERY_THRESHOLD, masteryPercent, type CohortSkillMastery } from "../lib/bkt";

/**
 * The class's skills as a radar: one spoke per skill, rings for the estimate,
 * the class average against its weakest quarter. Dents are the skills to teach
 * again, and the gap between the two lines is how far behind the students who
 * need help have fallen. A radar is poor for exact readings, so the table beside
 * it holds every value.
 */

/** Past this a radar's spokes stop being readable, so it keeps the weakest. */
const MAX_AXES = 12;
/** Fewer spokes than this can't make a shape. */
const MIN_AXES = 3;

const RINGS = [0.25, 0.5, 0.75];
/** Room outside the outer ring for the spoke labels. */
const PAD_PX = 32;
/** An empty centre, so low estimates on neighbouring spokes don't run together. */
const HOLE = 0.12;
const AVERAGE_COLOR = "var(--chart-1)";
const WEAKEST_COLOR = "var(--chart-2)";
const TIP_W = 232;

const TH = "pb-2 text-[11px] font-medium text-gray-500";
const VALUE_TH = `${TH} px-1 text-right @3xl:px-2`;
const VALUE_TD = "px-1 py-2 text-right tabular-nums @3xl:px-2";

/** The mean of the lowest quarter of the class; `distribution` is lowest first. */
function weakestQuarter(skill: CohortSkillMastery): number {
  const values = skill.distribution ?? [];
  if (values.length === 0) return skill.average_mastery;
  const lowest = values.slice(0, Math.ceil(values.length / 4));
  return lowest.reduce((sum, value) => sum + value, 0) / lowest.length;
}

/** Book order: spokes keep their place as filters change, and a chapter's skills sit together. */
function bookOrder(a: CohortSkillMastery, b: CohortSkillMastery): number {
  const [chapterA, numberA] = a.skill_id.split("-").map(Number);
  const [chapterB, numberB] = b.skill_id.split("-").map(Number);
  return chapterA - chapterB || numberA - numberB;
}

function Tooltip({ skill, spread, left, top }: { skill: CohortSkillMastery; spread: boolean; left: number; top: number }) {
  const values = skill.distribution ?? [];
  return (
    <div
      className="pointer-events-none absolute z-10 rounded-lg border border-hairline bg-surface px-3 py-2 shadow-overlay"
      style={{ left, top, width: TIP_W }}
    >
      <p className="text-xs font-semibold text-gray-900">
        Skill {skill.skill_id} <span className="font-normal text-gray-600">{skill.title}</span>
      </p>
      <p className="mt-1.5 text-xs text-gray-600">
        <span className="font-semibold tabular-nums text-gray-900">{masteryPercent(skill.average_mastery)}%</span>{" "}
        {skill.students === 1 ? "for the one student so far" : "class average"}
      </p>
      {spread && skill.students > 1 && (
        <p className="text-xs text-gray-600">
          <span className="font-semibold tabular-nums text-gray-900">{masteryPercent(weakestQuarter(skill))}%</span> weakest quarter
        </p>
      )}
      {skill.students > 1 && values.length > 0 && (
        <p className="mt-1 text-[11px] tabular-nums text-gray-500">
          Lowest {masteryPercent(values[0])}%, highest {masteryPercent(values[values.length - 1])}%
        </p>
      )}
      <p className="text-[11px] tabular-nums text-gray-500">
        {skill.mastered} of {skill.students} {skill.students === 1 ? "student" : "students"} mastered, from {skill.answers}{" "}
        {skill.answers === 1 ? "result" : "results"}
      </p>
    </div>
  );
}

function Radar({
  skills,
  spread,
  active,
  onActive,
}: {
  skills: CohortSkillMastery[];
  spread: boolean;
  active: string | null;
  onActive: (skillId: string | null) => void;
}) {
  // Drawn at the box's real width, so the labels keep their size on a phone.
  const boxRef = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<number | null>(null);
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setMeasured(Math.floor(entry.contentRect.width)));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const size = measured ?? 416;
  const center = size / 2;
  const outer = center - PAD_PX;
  const count = skills.length;

  const angle = (spoke: number) => -Math.PI / 2 + (spoke * 2 * Math.PI) / count;
  const radius = (value: number) => outer * (HOLE + value * (1 - HOLE));
  const point = (spoke: number, value: number) => ({
    x: center + radius(value) * Math.cos(angle(spoke)),
    y: center + radius(value) * Math.sin(angle(spoke)),
  });
  const shape = (values: number[]) =>
    `${values
      .map((value, spoke) => {
        const p = point(spoke, value);
        return `${spoke === 0 ? "M" : "L"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
      })
      .join(" ")} Z`;
  const ring = (value: number) => shape(skills.map(() => value));

  const averages = skills.map((s) => s.average_mastery);
  const weakest = skills.map(weakestQuarter);
  const activeSpoke = active === null ? -1 : skills.findIndex((s) => s.skill_id === active);

  // Between the last spoke and the first, so the labels never sit on a marker.
  // A polygon's edge is nearer the centre at its midpoint than at its corners.
  const labelAngle = -Math.PI / 2 - Math.PI / count;
  const ringLabel = (value: number) => ({
    x: center + radius(value) * Math.cos(Math.PI / count) * Math.cos(labelAngle),
    y: center + radius(value) * Math.cos(Math.PI / count) * Math.sin(labelAngle),
  });

  const tipFor = (spoke: number) => {
    const p = point(spoke, averages[spoke]);
    return {
      left: Math.max(0, Math.min(size - TIP_W, p.x - TIP_W / 2)),
      top: p.y > center ? Math.max(0, p.y - 132) : p.y + 14,
    };
  };

  return (
    <div ref={boxRef} className="relative mx-auto w-full max-w-[26rem]" onPointerLeave={() => onActive(null)}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="block overflow-visible">
        <path d={`${ring(1)} ${ring(MASTERY_THRESHOLD)}`} fillRule="evenodd" className="fill-emerald-500/15" />
        {[0, ...RINGS, 1].map((value) => (
          <path key={value} d={ring(value)} fill="none" className="stroke-gray-200" strokeWidth="1" />
        ))}
        <path d={ring(MASTERY_THRESHOLD)} fill="none" className="stroke-emerald-600/50" strokeWidth="1" />
        {skills.map((skill, spoke) => {
          const from = point(spoke, 0);
          const to = point(spoke, 1);
          return (
            <line
              key={skill.skill_id}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              className={spoke === activeSpoke ? "stroke-gray-500" : "stroke-gray-200"}
              strokeWidth="1"
            />
          );
        })}

        {RINGS.map((value) => {
          const p = ringLabel(value);
          return (
            <text
              key={value}
              x={p.x}
              y={p.y + 3}
              textAnchor="middle"
              fontSize="10"
              className="fill-gray-500 stroke-surface tabular-nums [paint-order:stroke] [stroke-width:3px]"
            >
              {value * 100}%
            </text>
          );
        })}
        <text
          x={ringLabel(1).x}
          y={ringLabel(1).y + 3}
          textAnchor="middle"
          fontSize="10"
          fontWeight="600"
          className="fill-gray-600 stroke-surface [paint-order:stroke] [stroke-width:3px]"
        >
          Mastered
        </text>

        <path d={shape(averages)} fill={AVERAGE_COLOR} fillOpacity="0.1" stroke={AVERAGE_COLOR} strokeWidth="2" strokeLinejoin="round" />
        {spread && (
          <path d={shape(weakest)} fill="none" stroke={WEAKEST_COLOR} strokeWidth="2" strokeDasharray="5 3" strokeLinejoin="round" />
        )}
        {spread &&
          weakest.map((value, spoke) => {
            const p = point(spoke, value);
            return (
              <circle
                key={skills[spoke].skill_id}
                cx={p.x}
                cy={p.y}
                r={spoke === activeSpoke ? 5 : 4}
                fill="var(--color-surface)"
                stroke={WEAKEST_COLOR}
                strokeWidth="2"
              />
            );
          })}
        {averages.map((value, spoke) => {
          const p = point(spoke, value);
          return (
            <circle
              key={skills[spoke].skill_id}
              cx={p.x}
              cy={p.y}
              r={spoke === activeSpoke ? 5.5 : 4}
              fill={AVERAGE_COLOR}
              stroke="var(--color-surface)"
              strokeWidth="1.5"
            />
          );
        })}

        {skills.map((skill, spoke) => {
          const a = angle(spoke);
          const x = center + (outer + 14) * Math.cos(a);
          const y = center + (outer + 14) * Math.sin(a);
          const anchor = Math.abs(Math.cos(a)) < 0.2 ? "middle" : Math.cos(a) > 0 ? "start" : "end";
          return (
            <text
              key={skill.skill_id}
              x={x}
              y={y + 4}
              textAnchor={anchor}
              fontSize="11"
              fontWeight={spoke === activeSpoke ? 700 : 500}
              className="fill-gray-700 tabular-nums"
            >
              {skill.skill_id}
            </text>
          );
        })}

        {/* The whole wedge is the hit target, so the reader aims at a skill, not a small dot. */}
        {skills.map((skill, spoke) => {
          const a = angle(spoke);
          const half = Math.PI / count;
          const reach = outer + PAD_PX;
          const corner = (t: number) => `${center + reach * Math.cos(t)} ${center + reach * Math.sin(t)}`;
          return (
            <path
              key={skill.skill_id}
              d={`M${center} ${center} L${corner(a - half)} L${corner(a)} L${corner(a + half)} Z`}
              role="img"
              tabIndex={0}
              aria-label={`Skill ${skill.skill_id}, ${skill.title}: ${masteryPercent(skill.average_mastery)}% class average${
                spread && skill.students > 1 ? `, ${masteryPercent(weakestQuarter(skill))}% weakest quarter` : ""
              }, ${skill.mastered} of ${skill.students} students mastered.`}
              fill="transparent"
              className="outline-none"
              onPointerEnter={() => onActive(skill.skill_id)}
              onFocus={() => onActive(skill.skill_id)}
              onBlur={() => onActive(null)}
            />
          );
        })}
      </svg>
      {activeSpoke >= 0 && <Tooltip skill={skills[activeSpoke]} spread={spread} {...tipFor(activeSpoke)} />}
    </div>
  );
}

/** Whether there is a spread to show: with one student per skill, both lines would be the same line. */
export function hasSpread(skills: readonly CohortSkillMastery[]): boolean {
  return skills.some((skill) => skill.students > 1);
}

/** What the lines mean, for beside the chart's summary line. */
export function MasteryChartKey({ spread }: { spread: boolean }) {
  return (
    <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-gray-500">
      <span className="inline-flex items-center gap-1.5">
        <svg aria-hidden width="18" height="8" viewBox="0 0 18 8">
          <line x1="0" y1="4" x2="18" y2="4" stroke={AVERAGE_COLOR} strokeWidth="2" />
          <circle cx="9" cy="4" r="3" fill={AVERAGE_COLOR} />
        </svg>
        Class average
      </span>
      {spread && (
        <span className="inline-flex items-center gap-1.5">
          <svg aria-hidden width="18" height="8" viewBox="0 0 18 8">
            <line x1="0" y1="4" x2="18" y2="4" stroke={WEAKEST_COLOR} strokeWidth="2" strokeDasharray="4 2" />
            <circle cx="9" cy="4" r="2.75" fill="var(--color-surface)" stroke={WEAKEST_COLOR} strokeWidth="1.5" />
          </svg>
          Weakest quarter of the class
        </span>
      )}
      <span className="inline-flex items-center gap-1.5">
        <span aria-hidden className="h-3 w-3 border border-emerald-600/50 bg-emerald-500/15" />
        Mastered, {Math.round(MASTERY_THRESHOLD * 100)}% or higher
      </span>
    </span>
  );
}

/** Holds the chart's shape while it loads, so nothing moves when it lands. */
export function SkillMasteryChartSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden className="@container animate-pulse">
      <div className="grid grid-cols-1 items-center gap-6 @3xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] @3xl:gap-8">
        <div className="mx-auto aspect-square w-full max-w-[26rem] rounded-full bg-gray-100/70" />
        <div>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4 border-t border-hairline py-3">
              <div className="h-3.5 w-1/2 rounded bg-gray-100" />
              <div className="h-3.5 w-24 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SkillMasteryChart({ skills }: { skills: CohortSkillMastery[] }) {
  const [active, setActive] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // `skills` arrives weakest first.
  const onRadar = skills.slice(0, MAX_AXES);
  const listed = showAll ? skills : onRadar;
  const spread = hasSpread(skills);
  const canDraw = onRadar.length >= MIN_AXES;

  return (
    <div className="@container">
      <div
        className={`grid grid-cols-1 gap-6 ${showAll ? "items-start" : "items-center"} ${
          canDraw ? "@3xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] @3xl:gap-8" : ""
        }`}
      >
        {canDraw && <Radar skills={[...onRadar].sort(bookOrder)} spread={spread} active={active} onActive={setActive} />}

        <div className="min-w-0">
          {!canDraw && (
            <p className="mb-3 text-xs text-gray-500">The radar appears once {MIN_AXES} skills have results.</p>
          )}
          {skills.length > MAX_AXES && (
            <p className="mb-2 text-xs text-gray-500">
              The radar shows the {MAX_AXES} weakest of {skills.length} skills.
            </p>
          )}
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr>
                <th className={`${TH} text-left`}>Skill</th>
                <th className={`${VALUE_TH} w-14 @3xl:w-16`}>Average</th>
                {spread && <th className={`${VALUE_TH} w-14 leading-tight @3xl:w-[4.5rem]`}>Weakest quarter</th>}
                <th className={`${VALUE_TH} w-16 pr-0 @3xl:w-[4.5rem] @3xl:pr-0`}>Mastered</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((skill) => (
                <tr
                  key={skill.skill_id}
                  onPointerEnter={() => setActive(skill.skill_id)}
                  onPointerLeave={() => setActive(null)}
                  className={`border-t border-hairline transition-colors ${active === skill.skill_id ? "bg-subtle" : ""}`}
                >
                  <td className="py-2 pr-2" title={skill.title}>
                    <p className="line-clamp-2 font-medium leading-snug text-gray-900 @3xl:line-clamp-1">
                      <span className="mr-1.5 font-normal tabular-nums text-gray-500">{skill.skill_id}</span>
                      {skill.title}
                    </p>
                  </td>
                  <td className={`${VALUE_TD} font-semibold text-gray-900`}>
                    {masteryPercent(skill.average_mastery)}%
                  </td>
                  {spread && (
                    <td className={`${VALUE_TD} text-gray-600`}>
                      {skill.students > 1 ? `${masteryPercent(weakestQuarter(skill))}%` : "—"}
                    </td>
                  )}
                  <td className={`${VALUE_TD} pr-0 text-gray-600 @3xl:pr-0`}>
                    {skill.mastered} of {skill.students}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {skills.length > MAX_AXES && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              className="mt-3 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
            >
              {showAll ? "Show the weakest only" : `Show all ${skills.length} skills`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
