import type { CSSProperties } from "react";
import Card from "../../components/Card";
import { SkeletonStatTile } from "../../components/skeletons";
import { CohortMasteryBody } from "../../components/SkillMastery";
import { LeaderboardSkeleton } from "./Leaderboard";

/** A grey placeholder block. The pulse comes from whatever wraps it. */
function Bone({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`max-w-full rounded bg-gray-100 ${className}`} style={style} />;
}

/** Mirrors a panel heading: the tinted icon, the title and, on most, a subtitle. */
function SkeletonHeading({
  title,
  subtitle,
  className = "mb-5",
}: {
  title: string;
  subtitle?: string;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 items-center gap-2.5 animate-pulse ${className}`}>
      <Bone className="h-10 w-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="flex h-6 items-center">
          <Bone className={`h-4 ${title}`} />
        </div>
        {subtitle && (
          <div className="flex h-4 items-center">
            <Bone className={`h-3 ${subtitle}`} />
          </div>
        )}
      </div>
    </div>
  );
}

/** The Chart / Table switch in a card's heading. */
function SkeletonToggle() {
  return <Bone className="h-[26px] w-[92px] shrink-0 rounded-lg" />;
}

/** A coloured key: a swatch and its label. */
function SkeletonKey({ swatch = "rounded-sm", label = "w-16" }: { swatch?: string; label?: string }) {
  return (
    <span className="flex h-4 items-center gap-1.5">
      <Bone className={`h-2.5 w-2.5 ${swatch}`} />
      <Bone className={`h-2.5 ${label}`} />
    </span>
  );
}

const TICKS = [0, 25, 50, 75, 100];

/**
 * Mirrors the page's column charts: a 0–100 axis with its gridlines, a
 * cluster of columns per period, group or course, and a label under each.
 * `className` sets the chart's height and top padding to the real one's.
 * The columns are positioned against the plot, so their percentage heights
 * resolve however the height is given (fixed, or a flex share of the card).
 */
function SkeletonColumns({
  clusters,
  labels = 1,
  bar,
  className,
}: {
  /** Fixed heights, in percent: random ones would change on every render. */
  clusters: readonly (readonly number[])[];
  /** Label lines under each cluster. */
  labels?: number;
  /** A column's widest. */
  bar: string;
  className: string;
}) {
  return (
    <div className={`flex flex-col ${className}`} aria-hidden>
      <div className="flex min-h-0 flex-1">
        <div className="relative w-8 shrink-0">
          {TICKS.map((t) => (
            <Bone key={t} className="absolute right-2 h-2 w-3 translate-y-1/2" style={{ bottom: `${t}%` }} />
          ))}
        </div>
        <div className="relative min-w-0 flex-1 border-b border-gray-200">
          {TICKS.slice(1).map((t) => (
            <div key={t} className="absolute inset-x-0 border-t border-hairline" style={{ bottom: `${t}%` }} />
          ))}
          <div className="absolute inset-0 flex">
            {clusters.map((heights, i) => (
              <div key={i} className="flex flex-1 items-end justify-center gap-1 px-1.5">
                {heights.map((h, j) => (
                  <Bone key={j} className={`flex-1 rounded-b-none rounded-t-md ${bar}`} style={{ height: `${h}%` }} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex pl-8">
        {clusters.map((_, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col items-center px-1 pt-2">
            {Array.from({ length: labels }, (_, j) => (
              <div key={j} className="flex h-4 w-full items-center justify-center">
                <Bone className={`h-2.5 ${j === 1 ? "w-12" : "w-9"}`} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const TREND = [
  [62, 55, 70],
  [58, 66, 74],
  [64, 60, 78],
  [72, 68, 80],
  [50, 57, 88],
  [66, 62, 72],
] as const;
const GROUPS = [
  [66, 72],
  [70, 78],
  [64, 74],
] as const;
const SKILL_AREAS = [[80], [72], [64], [76]] as const;
const COURSES = [[76], [70], [58]] as const;

/**
 * The dashboard's shape with nothing in it, shown until the first load lands.
 * Each block stands where a panel in `FacultyAnalyticsClient` sits, at the
 * same grid, spacing and heading, so the page doesn't jump when the figures
 * arrive — if that layout changes, change this with it. The card frames stay
 * still; only what is inside them pulses.
 */
export default function AnalyticsSkeleton() {
  return (
    <div role="status" aria-busy="true">
      <span className="sr-only">Loading analytics…</span>

      <div className="mb-4 grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonStatTile key={i} />
        ))}
      </div>

      {/* Performance by Activity: one figure and bar per kind of graded work. */}
      <Card padding="md" className="mb-4">
        <SkeletonHeading title="w-48" subtitle="w-80" />
        <div className="grid grid-cols-1 gap-x-6 gap-y-5 animate-pulse sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i}>
              <div className="flex h-4 items-center">
                <Bone className="h-3 w-24" />
              </div>
              <div className="mt-1 flex h-8 items-center">
                <Bone className="h-6 w-16" />
              </div>
              <Bone className="mt-2 h-1.5 w-full rounded-full" />
              <div className="mt-1.5 flex h-4 items-center">
                <Bone className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="mb-4 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <Card padding="md" className="flex flex-col">
          <SkeletonHeading title="w-44" />
          <div className="flex flex-1 flex-col justify-center">
            <LeaderboardSkeleton rows={7} />
          </div>
          <div className="mt-4 flex justify-end border-t border-hairline pt-3 animate-pulse">
            <div className="flex h-5 items-center">
              <Bone className="h-3.5 w-36" />
            </div>
          </div>
        </Card>

        <Card padding="md" className="flex flex-col lg:col-span-2">
          <div className="mb-5 flex items-center justify-between gap-3">
            <SkeletonHeading title="w-60" subtitle="w-56" className="" />
            <div className="flex shrink-0 items-center gap-3 animate-pulse">
              <Bone className="h-2.5 w-12" />
              <SkeletonToggle />
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-center animate-pulse">
            <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-0.5 px-1.5 py-0.5">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonKey key={i} swatch="rounded-full" label="w-14" />
              ))}
            </div>
            <SkeletonColumns clusters={TREND} bar="max-w-7" className="min-h-60 flex-1 pt-4" />
          </div>
        </Card>
      </div>

      {/* Groups, skill areas and courses, lined up with the row above; under xl
          the courses take a row of their own, as the page lays them out. */}
      <div className="mb-4 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card padding="md" className="flex flex-col">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <SkeletonHeading title="w-40" subtitle="w-56" className="" />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 animate-pulse">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <SkeletonKey />
                <SkeletonKey label="w-12" />
                <SkeletonKey swatch="w-px" label="w-14" />
              </div>
              <SkeletonToggle />
            </div>
          </div>
          <div className="animate-pulse">
            <SkeletonColumns clusters={GROUPS} labels={3} bar="max-w-8" className="mt-5 h-[280px]" />
          </div>
        </Card>

        <Card padding="md" className="flex flex-col">
          <SkeletonHeading title="w-44" subtitle="w-32" />
          <div className="flex flex-1 flex-col justify-center animate-pulse">
            <SkeletonColumns clusters={SKILL_AREAS} labels={2} bar="max-w-14" className="h-[300px] pt-6" />
          </div>
        </Card>

        <Card padding="md" className="flex flex-col lg:col-span-2 xl:col-span-1">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <SkeletonHeading title="w-40" subtitle="w-52" className="" />
            <div className="animate-pulse">
              <SkeletonKey swatch="w-px" label="w-14" />
            </div>
          </div>
          <div className="flex flex-1 flex-col justify-center animate-pulse">
            <SkeletonColumns clusters={COURSES} labels={2} bar="max-w-14" className="h-[300px] pt-6" />
          </div>
        </Card>
      </div>

      {/* Skill Mastery draws its own loading state, the one it shows when it
          lands after the rest of the page. */}
      <Card padding="md" className="mb-4">
        <SkeletonHeading title="w-24" subtitle="w-40" />
        <CohortMasteryBody data={null} loading />
      </Card>
    </div>
  );
}
