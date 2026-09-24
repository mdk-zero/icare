"use client";

import { useCallback, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faChartBar,
  faUsers,
  faDoorOpen,
  faExclamationTriangle,
  faRotate,
  faUserTie,
  faBuilding,
  faTrophy,
  faLayerGroup,
  faUserCheck,
  faClipboardCheck,
  faUserGraduate,
} from "@fortawesome/free-solid-svg-icons";
import {
  apiFetch,
  fetchAnalyticsSummary,
  fetchFacultySections,
  fetchRooms,
  runWarehouseEtl,
} from "../../lib/api";
import type { Section } from "../../lib/api";
import { usePageData } from "../../lib/use-page-data";
import PageHeader from "../../components/PageHeader";
import Avatar from "../../components/Avatar";
import StatTile from "../../components/StatTile";
import AnalyticsFilterBar, {
  formatRangeLabel,
  rangeForPreset,
  type PresetId,
} from "../../components/AnalyticsFilterBar";

interface AdminFacultyRow {
  name: string;
  sections: { id: string; name: string }[];
}

/** How many of the busiest rooms to show — a ranking reads better short. */
const TOP_ROOMS = 5;
/** Podium (three) plus the two runners-up beneath it. */
const TOP_STUDENTS = 5;

// Stable empty fallbacks, so nothing downstream sees a new value each render.
const NO_SECTION_FACULTY = new Map<string, string[]>();
const NO_SECTIONS: Section[] = [];

/** The frame every chart card on the page shares. */
function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-hairline bg-surface p-6 shadow-tile ${className}`}
    >
      {children}
    </div>
  );
}

/** Says which of the page's controls a panel answers to: a green "Live" for
 * figures read straight from the database, or the applied date range for the
 * ones that follow the filters above. The difference is easy to miss otherwise. */
function ScopeTag({ live, label, dark }: { live?: boolean; label?: string; dark?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
        dark ? "bg-white/10 text-white/80" : "bg-subtle text-gray-600"
      }`}
    >
      {live && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
        </span>
      )}
      {live ? "Live" : label}
    </span>
  );
}

/** Panel title with a small brand-coloured icon, the subtitle beneath, and the
 * panel's scope tag (and anything else) at the right, over a hairline. */
function CardHeading({
  icon,
  title,
  subtitle,
  tag,
  aside,
  dark = false,
}: {
  icon: IconDefinition;
  title: string;
  subtitle?: string;
  tag?: ReactNode;
  aside?: ReactNode;
  /** For a panel on the dark "monitor" surface. */
  dark?: boolean;
}) {
  return (
    <div
      className={`relative mb-5 flex items-start justify-between gap-4 border-b pb-4 ${
        dark ? "border-white/10" : "border-hairline"
      }`}
    >
      <div className="min-w-0">
        <h3
          className={`flex items-center gap-2 font-display text-lg font-semibold ${
            dark ? "text-white" : "text-gray-900"
          }`}
        >
          <FontAwesomeIcon
            icon={icon}
            className={`h-4 w-4 shrink-0 ${dark ? "text-[#3fd0c9]" : "text-brand-600"}`}
          />
          <span className="truncate">{title}</span>
        </h3>
        {subtitle && (
          <p className={`mt-0.5 text-sm ${dark ? "text-white/60" : "text-gray-500"}`}>{subtitle}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-4">
        {aside}
        {tag}
      </div>
    </div>
  );
}

/** Medal for the top three, a plain number below that — the same ranking
 * language the student leaderboard uses. */
function rankBadgeClass(rank: number): string {
  if (rank === 1) return "bg-gradient-to-br from-amber-300 to-amber-500 text-white shadow-sm";
  if (rank === 2) return "bg-gradient-to-br from-slate-300 to-slate-400 text-white shadow-sm";
  if (rank === 3) return "bg-gradient-to-br from-orange-300 to-orange-500 text-white shadow-sm";
  return "bg-gray-100 text-gray-500";
}

/** One row shared by every list below: a badge, a proportional fill bar
 * behind the text, and a bold trailing figure — magnitude and rank both
 * legible at a glance instead of a plain number in a table cell. */
function BarRow({
  badge,
  badgeClass,
  label,
  sublabel,
  fillPct,
  fillClass,
  trailing,
  trailingSub,
}: {
  badge: ReactNode;
  badgeClass: string;
  label: string;
  sublabel?: string;
  fillPct: number;
  fillClass: string;
  trailing: ReactNode;
  trailingSub?: string;
}) {
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-xl border border-hairline bg-surface p-3">
      <div
        className={`absolute inset-y-0 left-0 transition-all duration-700 ease-out ${fillClass}`}
        style={{ width: `${Math.min(Math.max(fillPct, 0), 100)}%` }}
        aria-hidden
      />
      <span
        className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${badgeClass}`}
      >
        {badge}
      </span>
      <div className="relative z-10 min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-gray-900">{label}</p>
        {sublabel && <p className="truncate text-xs text-gray-400">{sublabel}</p>}
      </div>
      <div className="relative z-10 shrink-0 text-right">
        <p className="text-sm font-bold tabular-nums text-gray-800">{trailing}</p>
        {trailingSub && <p className="text-[11px] text-gray-400">{trailingSub}</p>}
      </div>
    </div>
  );
}

const ROLE_SLICES = [
  { key: "student", label: "Students", color: "#2a8a98" },
  { key: "faculty", label: "Faculty", color: "#f59e0b" },
  { key: "admin", label: "Admins", color: "#7c3aed" },
] as const;

/** Large donut of who the users are, with each role's share, name and count in
 * a row underneath. The card is stretched to match its neighbour, so the ring
 * takes the free height instead of leaving a gap. */
function RoleDonut({ counts }: { counts: Record<"student" | "faculty" | "admin", number> }) {
  const total = counts.student + counts.faculty + counts.admin;
  const r = 45;
  const c = 2 * Math.PI * r;
  const gap = 2.5;
  let offset = 0;
  return (
    <div className="flex flex-1 flex-col justify-between gap-6">
      <div className="flex flex-1 items-center justify-center">
        <div className="relative aspect-square w-full max-w-[15rem]">
          <svg
            viewBox="0 0 120 120"
            className="h-full w-full -rotate-90"
            role="img"
            aria-label="Users by role"
          >
            <circle
              cx="60"
              cy="60"
              r={r}
              fill="none"
              className="stroke-gray-200"
              strokeWidth="18"
            />
            {total > 0 &&
              ROLE_SLICES.map((slice) => {
                const len = (counts[slice.key] / total) * c;
                const el =
                  len > 0 ? (
                    <circle
                      key={slice.key}
                      cx="60"
                      cy="60"
                      r={r}
                      fill="none"
                      stroke={slice.color}
                      strokeWidth="18"
                      strokeDasharray={`${Math.max(len - gap, 0.1)} ${c}`}
                      strokeDashoffset={-offset}
                    />
                  ) : null;
                offset += len;
                return el;
              })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="font-display text-5xl font-bold text-gray-900">{total}</p>
            <p className="text-sm text-gray-500">Users</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        {ROLE_SLICES.map((slice) => (
          <div key={slice.key}>
            <p className="font-display text-3xl font-bold tabular-nums text-gray-900">
              {total > 0 ? Math.round((100 * counts[slice.key]) / total) : 0}
              <span className="text-base font-semibold text-gray-400">%</span>
            </p>
            <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-gray-500">
              <span
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ backgroundColor: slice.color }}
              />
              {slice.label} · {counts[slice.key]}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One figure with a tinted icon disc — the strip along the bottom of a card. */
function MiniStat({
  icon,
  label,
  value,
  chip,
}: {
  icon: IconDefinition;
  label: string;
  value: ReactNode;
  chip: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${chip}`}>
        <FontAwesomeIcon icon={icon} className="h-4 w-4" />
      </span>
      <div className="min-w-0">
        <p className="truncate text-xs text-gray-500">{label}</p>
        <p className="font-display text-lg font-bold tabular-nums text-gray-900">{value}</p>
      </div>
    </div>
  );
}

/** Each room keeps its own colour, by rank, so a gauge can be told apart from
 * its neighbours; the number and name under it carry the meaning. */
const ROOM_GAUGE_COLORS = [
  { from: "#155663", to: "#2a8a98", chip: "text-[#1b6b7b]" },
  { from: "#f97316", to: "#fbbf24", chip: "text-orange-500" },
  { from: "#7c3aed", to: "#a78bfa", chip: "text-purple-600" },
  { from: "#2563eb", to: "#38bdf8", chip: "text-blue-600" },
  { from: "#e11d48", to: "#fb7185", chip: "text-rose-600" },
] as const;

/** Thick semicircle gauge for one room: gradient arc over a pale track, a door
 * disc in the middle, then the percentage, name and beds beneath. */
function RoomGauge({
  id,
  name,
  sublabel,
  percent,
  beds,
  colorIndex,
}: {
  id: string;
  name: string;
  sublabel: string;
  percent: number;
  beds: string;
  colorIndex: number;
}) {
  const color = ROOM_GAUGE_COLORS[colorIndex % ROOM_GAUGE_COLORS.length];
  const fill = Math.min(Math.max(percent, 0), 100);
  const arc = "M16,60 A44,44 0 0 1 104,60";
  const gradId = `roomGauge-${id}`;
  return (
    <div className="flex flex-col items-center rounded-2xl border border-hairline bg-gradient-to-b from-gray-50 to-transparent px-3 pb-4 pt-5 text-center">
      <div className="relative w-full max-w-[11rem]">
        <svg
          viewBox="0 0 120 70"
          className="block w-full"
          role="img"
          aria-label={`${name}: ${percent}% occupied`}
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={color.from} />
              <stop offset="100%" stopColor={color.to} />
            </linearGradient>
          </defs>
          <path d={arc} pathLength={100} fill="none" strokeWidth="16" className="stroke-gray-200" />
          {fill > 0 && (
            <path
              d={arc}
              pathLength={100}
              fill="none"
              stroke={`url(#${gradId})`}
              strokeWidth="16"
              strokeDasharray={`${fill} 100`}
              style={{ transition: "stroke-dasharray 700ms ease-out" }}
            />
          )}
        </svg>
        <span
          className={`absolute left-1/2 top-[58%] flex h-[26%] w-[26%] min-h-7 min-w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-surface shadow-tile ${color.chip}`}
        >
          <FontAwesomeIcon icon={faDoorOpen} className="h-3.5 w-3.5" />
        </span>
        <span className="absolute -bottom-3 left-[6%] text-[10px] text-gray-400">0%</span>
        <span className="absolute -bottom-3 right-[4%] text-[10px] text-gray-400">100%</span>
      </div>
      <p className="mt-2 font-display text-2xl font-bold tabular-nums text-gray-900">{percent}%</p>
      <p className="mt-0.5 w-full truncate text-sm font-semibold text-gray-900">{name}</p>
      <p className="w-full truncate text-xs text-gray-400">{sublabel}</p>
      <p className="text-xs font-medium tabular-nums text-gray-500">{beds}</p>
    </div>
  );
}

const ROOM_STATUS_TONE: Record<string, { badge: string; fill: string; label: string }> = {
  active: {
    badge: "bg-emerald-100 text-emerald-600",
    fill: "bg-emerald-500/[0.08]",
    label: "Active",
  },
  inactive: { badge: "bg-gray-100 text-gray-500", fill: "bg-gray-400/[0.08]", label: "Inactive" },
  maintenance: {
    badge: "bg-amber-100 text-amber-600",
    fill: "bg-amber-500/[0.08]",
    label: "Maintenance",
  },
};

/** Smallest round step (1/2/5/10 × 10ⁿ) at or above `rough`, so gridlines land
 * on whole numbers. */
function niceStep(rough: number): number {
  if (rough <= 1) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  for (const m of [1, 2, 5, 10]) if (m * magnitude >= rough) return m * magnitude;
  return 10 * magnitude;
}

function shortLabel(name: string, max = 11): string {
  return name.length > max ? `${name.slice(0, max - 1)}…` : name;
}

/** One column per section: the light bar is everyone enrolled, the dark bar in
 * front of it is who has been active. Hover (or tab to) a column for the exact
 * figures — the plot itself carries no per-bar numbers. */
function SectionColumns({
  data,
}: {
  data: { id: string; name: string; students: number; active_students: number }[];
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const W = 640;
  const H = 170;
  const pad = { left: 34, right: 8, top: 22, bottom: 32 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const rawMax = Math.max(...data.map((d) => d.students), 1);
  const step = niceStep(rawMax / 4);
  const max = Math.ceil(rawMax / step) * step;
  const ticks: number[] = [];
  for (let t = 0; t <= max; t += step) ticks.push(t);
  const band = plotW / data.length;
  const barW = Math.min(band * 0.5, 48);
  const y = (v: number) => pad.top + plotH - (v / max) * plotH;
  const roundedTop = (x: number, top: number, w: number, base: number) => {
    const h = base - top;
    const r = Math.min(5, h / 2, w / 2);
    return `M${x},${base} V${top + r} Q${x},${top} ${x + r},${top} H${x + w - r} Q${x + w},${top} ${x + w},${top + r} V${base} Z`;
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-200" /> Enrolled
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> Active
        </span>
      </div>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-auto w-full"
          role="img"
          aria-label="Active students per section"
        >
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={pad.left}
                x2={W - pad.right}
                y1={y(t)}
                y2={y(t)}
                className="stroke-gray-200"
                strokeWidth="1"
                strokeDasharray={t === 0 ? undefined : "3 4"}
              />
              <text
                x={pad.left - 6}
                y={y(t) + 3.5}
                textAnchor="end"
                className="fill-gray-400"
                fontSize="10"
              >
                {t}
              </text>
            </g>
          ))}
          {data.map((d, i) => {
            const x = pad.left + band * i + (band - barW) / 2;
            const base = pad.top + plotH;
            const dim = hovered !== null && hovered !== i;
            return (
              <g key={d.id} opacity={dim ? 0.45 : 1} className="transition-opacity">
                {d.students > 0 && (
                  <path d={roundedTop(x, y(d.students), barW, base)} className="fill-brand-200" />
                )}
                {d.active_students > 0 && (
                  <path
                    d={roundedTop(x, y(d.active_students), barW, base)}
                    className="fill-brand-600"
                  />
                )}
                <text
                  x={x + barW / 2}
                  y={y(Math.max(d.active_students, d.students)) - 6}
                  textAnchor="middle"
                  className="fill-gray-800"
                  fontSize="11"
                  fontWeight="600"
                >
                  {d.active_students}
                </text>
                <text
                  x={x + barW / 2}
                  y={H - 10}
                  textAnchor="middle"
                  className="fill-gray-500"
                  fontSize="10"
                >
                  {shortLabel(d.name)}
                </text>
                <rect
                  x={pad.left + band * i}
                  y={pad.top}
                  width={band}
                  height={plotH + pad.bottom}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${d.name}: ${d.active_students} of ${d.students} students active`}
                  onMouseEnter={() => setHovered(i)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(i)}
                  onBlur={() => setHovered(null)}
                />
              </g>
            );
          })}
        </svg>
        {hovered !== null && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs shadow-overlay"
            style={{
              left: `${((pad.left + band * (hovered + 0.5)) / W) * 100}%`,
              top: `${(Math.max(y(data[hovered].students) - 56, 0) / H) * 100}%`,
            }}
          >
            <p className="font-semibold text-gray-900">{data[hovered].name}</p>
            <p className="text-gray-600">
              {data[hovered].active_students}/{data[hovered].students} active ·{" "}
              {data[hovered].students > 0
                ? Math.round((100 * data[hovered].active_students) / data[hovered].students)
                : 0}
              %
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

/** A grey placeholder block. The pulse comes from the wrapper around the page. */
function Bone({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <div className={`rounded bg-gray-100 ${className}`} style={style} />;
}

/** Mirrors CardHeading: icon and title, the subtitle, and the scope tag, over a hairline. */
function SkeletonHeading({ subtitle = "w-56" }: { subtitle?: string }) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4 border-b border-hairline pb-4">
      <div className="min-w-0">
        <div className="flex h-7 items-center gap-2">
          <Bone className="h-4 w-4" />
          <Bone className="h-5 w-40" />
        </div>
        <div className="mt-0.5 flex h-5 items-center">
          <Bone className={`h-3.5 ${subtitle}`} />
        </div>
      </div>
      <Bone className="h-6 w-24 shrink-0 rounded-full" />
    </div>
  );
}

/** Mirrors StatTile: label beside a round icon, a display-size value, a caption. */
function SkeletonTile() {
  return (
    <div className="flex flex-col rounded-2xl border border-hairline bg-surface p-5 shadow-tile">
      <div className="flex items-start justify-between gap-2">
        <Bone className="mt-0.5 h-3 w-24" />
        <Bone className="h-11 w-11 shrink-0 rounded-full" />
      </div>
      <Bone className="mt-3.5 h-11 w-20" />
      <div className="mt-3 flex h-4 items-center">
        <Bone className="h-3 w-40" />
      </div>
    </div>
  );
}

/** Mirrors BarRow: a rank badge, two lines of text, a trailing figure. */
function SkeletonBarRow() {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-hairline bg-surface p-3">
      <Bone className="h-8 w-8 shrink-0 rounded-full" />
      <div className="flex h-9 min-w-0 flex-1 flex-col justify-center gap-1.5">
        <Bone className="h-3.5 w-1/2" />
        <Bone className="h-3 w-2/3" />
      </div>
      <Bone className="h-4 w-10 shrink-0" />
    </div>
  );
}

/** One podium place. The middle one is the winner's, so it stands taller. */
function SkeletonPodiumCard({ first = false }: { first?: boolean }) {
  return (
    <div
      className={`flex flex-col items-center rounded-2xl border border-hairline px-3 pb-4 ${
        first ? "pt-6 sm:pb-6" : "pt-4"
      }`}
    >
      <Bone className={`rounded-full ${first ? "h-16 w-16" : "h-12 w-12"}`} />
      <Bone className="mt-3 h-3.5 w-4/5" />
      <Bone className="mt-1.5 h-3 w-1/2" />
      <Bone className={`mt-3 ${first ? "h-8 w-16" : "h-7 w-14"}`} />
      <Bone className="mt-1.5 h-2.5 w-14" />
    </div>
  );
}

/** Mirrors RoomGauge: a semicircle over a percentage, the room's name and its beds. */
function SkeletonGauge() {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-hairline px-3 pb-4 pt-5">
      <Bone className="aspect-[120/70] w-full max-w-[11rem] rounded-t-full" />
      <Bone className="mt-4 h-7 w-16" />
      <Bone className="mt-2 h-4 w-3/4" />
      <Bone className="mt-1.5 h-3 w-1/2" />
      <Bone className="mt-1.5 h-3 w-1/3" />
    </div>
  );
}

/** Mirrors MiniStat: a tinted disc beside a label and a figure. */
function SkeletonMiniStat() {
  return (
    <div className="flex items-center gap-3">
      <Bone className="h-10 w-10 shrink-0 rounded-full" />
      <div className="space-y-2">
        <Bone className="h-3 w-16" />
        <Bone className="h-4 w-10" />
      </div>
    </div>
  );
}

// Fixed, so the placeholder columns don't reshuffle between renders.
const SKELETON_COLUMNS = [55, 80, 40, 65, 90, 50];

/**
 * The dashboard's shape with nothing in it, shown until the first load lands.
 * Each block below stands where a panel in `AdminAnalyticsClient` sits, at the
 * same grid and spacing, so the page doesn't jump when the figures arrive — if
 * that layout changes, change this with it.
 */
function AnalyticsSkeleton() {
  return (
    <div className="animate-pulse" role="status" aria-busy="true">
      <span className="sr-only">Loading analytics…</span>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonTile key={i} />
        ))}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel>
          <SkeletonHeading subtitle="w-64" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBarRow key={i} />
            ))}
          </div>
        </Panel>

        <Panel>
          <SkeletonHeading subtitle="w-48" />
          <div className="grid grid-cols-3 items-end gap-3 sm:gap-6">
            <SkeletonPodiumCard />
            <SkeletonPodiumCard first />
            <SkeletonPodiumCard />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-2">
            <SkeletonBarRow />
            <SkeletonBarRow />
          </div>
        </Panel>
      </div>

      <Panel className="mb-6">
        <SkeletonHeading subtitle="w-40" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: TOP_ROOMS }).map((_, i) => (
            <SkeletonGauge key={i} />
          ))}
        </div>
      </Panel>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel className="lg:col-span-2">
          <SkeletonHeading subtitle="w-72" />
          <div className="mb-3 flex items-center gap-4">
            <Bone className="h-3 w-16" />
            <Bone className="h-3 w-14" />
          </div>
          <div className="flex aspect-[640/170] w-full items-end gap-4 rounded-lg bg-gray-50 px-6 pt-4">
            {SKELETON_COLUMNS.map((height, i) => (
              <Bone
                key={i}
                className="flex-1 rounded-b-none rounded-t-md"
                style={{ height: `${height}%` }}
              />
            ))}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 border-t border-hairline pt-5 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonMiniStat key={i} />
            ))}
          </div>
        </Panel>

        <Panel className="flex flex-col">
          <SkeletonHeading subtitle="w-36" />
          <div className="flex flex-1 flex-col justify-between gap-6">
            <div className="flex flex-1 items-center justify-center">
              <div className="aspect-square w-full max-w-[15rem] rounded-full border-[2rem] border-gray-100" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <Bone className="h-8 w-12" />
                  <Bone className="h-3 w-20" />
                </div>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

export default function AdminAnalyticsClient() {
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filters — the same section + range controls the faculty dashboard has.
  const [sectionIds, setSectionIds] = useState<string[]>([]);
  const [preset, setPreset] = useState<PresetId>("3m");
  // Lazily initialised so `new Date()` never runs during a server render.
  const [range, setRange] = useState(() => rangeForPreset("3m"));
  // What the custom date inputs show, kept apart from the applied `range` so a
  // half-typed or inverted range doesn't fire a request.
  const [draft, setDraft] = useState(() => rangeForPreset("3m"));

  const { from, to } = range;
  const sectionKey = [...sectionIds].sort().join(",");

  const { data: sectionsData } = usePageData("faculty:sections", fetchFacultySections);
  const allSections = sectionsData ?? NO_SECTIONS;

  const applyPreset = useCallback((id: PresetId) => {
    setPreset(id);
    if (id === "custom") return;
    const next = rangeForPreset(id);
    setRange(next);
    setDraft(next);
  }, []);

  const setCustom = (edge: "from" | "to", value: string) => {
    const next = { ...draft, [edge]: value };
    setDraft(next);
    // Only a complete, ordered range becomes a query.
    if (next.from && next.to && next.from <= next.to) setRange(next);
  };

  // Follows the filters: one cache entry per combination.
  const {
    data: analytics,
    loading,
    revalidating,
    refresh: reloadSummary,
  } = usePageData(
    `admin:analytics:${sectionKey}:${from}:${to}`,
    () => fetchAnalyticsSummary({ sectionIds, from, to, sectionTrend: true }),
    { keepPreviousData: true },
  );

  // Live figures that don't depend on the filters, so they aren't re-read on
  // every filter change.
  const {
    data: live,
    loading: liveLoading,
    refresh: reloadLive,
  } = usePageData("admin:analytics:live", async () => {
    const [facultyRes, usersRes, rooms] = await Promise.all([
      apiFetch("/api/admin/faculty", { credentials: "include" }),
      apiFetch("/api/admin/users", { credentials: "include" }),
      fetchRooms(),
    ]);
    const facultyJson = facultyRes.ok
      ? ((await facultyRes.json()) as { faculty?: AdminFacultyRow[] })
      : {};
    const users = usersRes.ok
      ? (((await usersRes.json()) as { users?: { role: string }[] }).users ?? [])
      : [];
    const totalUsers = users.length;
    const roleCounts = { student: 0, faculty: 0, admin: 0 };
    for (const u of users) {
      if (u.role === "student" || u.role === "faculty" || u.role === "admin")
        roleCounts[u.role] += 1;
    }

    // Which faculty teach each section, so the performance ranking below can
    // read by name instead of by section code.
    const sectionFaculty = new Map<string, string[]>();
    for (const f of facultyJson.faculty ?? []) {
      for (const s of f.sections) {
        sectionFaculty.set(s.id, [...(sectionFaculty.get(s.id) ?? []), f.name]);
      }
    }
    return { sectionFaculty, totalUsers, roleCounts, rooms };
  });

  const summary = analytics?.summary ?? null;
  const sectionFaculty = live?.sectionFaculty ?? NO_SECTION_FACULTY;
  const totalUsers = live?.totalUsers ?? 0;
  const roleCounts = live?.roleCounts ?? { student: 0, faculty: 0, admin: 0 };
  const allRooms = live?.rooms;

  const handleRefresh = async () => {
    setError(null);
    setRefreshing(true);
    const result = await runWarehouseEtl();
    if (result.error) {
      setError(result.error);
    } else {
      await Promise.all([reloadSummary(), reloadLive()]);
    }
    setRefreshing(false);
  };

  const sectionCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of summary?.sections ?? []) counts[s.id] = s.students;
    return counts;
  }, [summary]);

  const atRisk = summary?.risk_distribution?.at_risk ?? 0;
  const totalStudents = summary?.cohort.total_students ?? 0;
  const activeStudents = summary?.cohort.active_students_30d ?? 0;
  const activeRate = totalStudents
    ? Math.min(100, Math.round((activeStudents / totalStudents) * 100))
    : 0;

  const atRiskRate = totalStudents ? Math.min(100, Math.round((100 * atRisk) / totalStudents)) : 0;

  const roomList = useMemo(() => allRooms ?? [], [allRooms]);
  const activeRooms = roomList.filter((r) => r.status === "active").length;

  // Occupancy reads from the rooms themselves — patients actually admitted to
  // a bed — rather than the warehouse's room_assignments count, which tracks
  // students rostered for clinical duty and is usually empty even when every
  // room is full of patients. Busiest five only; the rest is what the Rooms
  // page is for.
  const totalBeds = roomList.reduce((n, r) => n + r.capacity, 0);
  const occupiedBeds = roomList.reduce((n, r) => n + r.patients_assigned, 0);
  const overallOccupancy = totalBeds > 0 ? Math.round((100 * occupiedBeds) / totalBeds) : 0;
  const rooms = roomList
    .map((r) => ({
      ...r,
      utilization_pct: r.capacity > 0 ? Math.round((100 * r.patients_assigned) / r.capacity) : 0,
    }))
    .sort((a, b) => b.utilization_pct - a.utilization_pct)
    .slice(0, TOP_ROOMS);

  // Section performance rolled up from the weekly trend, then relabeled by
  // whoever teaches that section — a faculty ranking built on their
  // students' own submitted scores, not a self-reported figure.
  const sectionAgg = new Map<string, { name: string; weightedScore: number; attempts: number }>();
  for (const row of summary?.section_trend ?? []) {
    const entry = sectionAgg.get(row.section_id) ?? {
      name: row.section_name,
      weightedScore: 0,
      attempts: 0,
    };
    entry.weightedScore += row.average_score * row.attempts;
    entry.attempts += row.attempts;
    sectionAgg.set(row.section_id, entry);
  }
  const facultyPerf = Array.from(sectionAgg.entries())
    .map(([sectionId, agg]) => {
      const students = summary?.sections.find((s) => s.id === sectionId)?.students ?? 0;
      const names = sectionFaculty.get(sectionId);
      const label = names && names.length > 0 ? names.join(" & ") : agg.name;
      return {
        sectionId,
        label,
        sectionName: agg.name,
        avgScore: agg.attempts > 0 ? Math.round(agg.weightedScore / agg.attempts) : 0,
        attempts: agg.attempts,
        students,
      };
    })
    .filter((r) => r.attempts > 0)
    .sort((a, b) => b.avgScore - a.avgScore);
  const facultyPerfMax = Math.max(...facultyPerf.map((f) => f.avgScore), 1);

  const sectionEngagement = (summary?.sections ?? [])
    .filter((s) => s.students > 0)
    .map((s) => ({ ...s, active_students: s.active_students ?? 0 }));
  const topStudents = (summary?.top_students ?? []).slice(0, TOP_STUDENTS);
  const podium = topStudents.slice(0, 3);
  const runnersUp = topStudents.slice(3);

  // Silver, gold, bronze left to right, gold raised — but only when all three
  // exist; a shorter list just reads in rank order.
  const podiumOrder = podium.length === 3 ? [1, 0, 2] : podium.map((_, i) => i);

  // The live figures gate it too: without them the tiles would read zero and
  // the rooms panel "No rooms configured" until they landed.
  const firstLoad = (loading && !summary) || liveLoading;
  const rangeTag = <ScopeTag label={formatRangeLabel(from, to)} />;
  const liveTag = <ScopeTag live />;

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faChartBar} className="w-3.5 h-3.5" />,
          label: "System Analytics",
        }}
        title="Analytics Dashboard"
        subtitle="Cohort analytics from the iCARE++ star-schema warehouse"
      />

      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-200 rounded-xl text-sm text-rose-700">
          {error}
        </div>
      )}

      <AnalyticsFilterBar
        sections={allSections}
        sectionIds={sectionIds}
        onSectionsChange={setSectionIds}
        sectionCounts={sectionCounts}
        preset={preset}
        onPresetChange={applyPreset}
        draft={draft}
        onDraftChange={setCustom}
        range={range}
        refreshing={revalidating}
      />

      {firstLoad ? (
        <AnalyticsSkeleton />
      ) : (
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile
              icon={faUsers}
              value={totalUsers}
              label="Total Users"
              caption="Students, faculty and admins"
            />
            <StatTile
              icon={faUserCheck}
              value={activeStudents}
              label="Active Students"
              caption={`${activeRate}% of ${totalStudents} students · last 30 days`}
              iconBg="bg-emerald-50"
              iconColor="text-emerald-600"
            />
            <StatTile
              icon={faExclamationTriangle}
              value={atRisk}
              label="At-Risk Students"
              caption={
                totalStudents
                  ? `${atRiskRate}% of ${totalStudents} students`
                  : "No students in range"
              }
              iconBg="bg-rose-50"
              iconColor="text-rose-600"
            />
            <StatTile
              icon={faDoorOpen}
              value={activeRooms}
              label="Active Rooms"
              caption={`${occupiedBeds}/${totalBeds} beds occupied`}
            />
          </div>

          {/* Faculty Performance + Top Students, side by side */}
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2 mb-4">
            <Panel>
              <CardHeading
                icon={faUserTie}
                title="Faculty Performance"
                subtitle="Ranked by their students' average submitted score"
                tag={rangeTag}
              />
              {facultyPerf.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  No submitted attempts in range yet — rankings appear once students start.
                </p>
              ) : (
                <div className="space-y-2">
                  {facultyPerf.map((f, i) => (
                    <BarRow
                      key={f.sectionId}
                      badge={i + 1}
                      badgeClass={rankBadgeClass(i + 1)}
                      label={f.label}
                      sublabel={`${f.sectionName !== f.label ? `${f.sectionName} · ` : ""}${f.students} student${f.students === 1 ? "" : "s"} · ${f.attempts} attempt${f.attempts === 1 ? "" : "s"}`}
                      fillPct={(f.avgScore / facultyPerfMax) * 100}
                      fillClass="bg-brand-600/[0.06]"
                      trailing={`${f.avgScore}%`}
                    />
                  ))}
                </div>
              )}
            </Panel>

            {/* Top students: podium for the first three, rows for the rest */}
            <Panel>
              <CardHeading
                icon={faTrophy}
                title="Top Students"
                subtitle="Highest average submitted score"
                tag={rangeTag}
              />
              {topStudents.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">No submitted attempts yet.</p>
              ) : (
                <>
                  <div className="grid grid-cols-3 items-end gap-3 sm:gap-6">
                    {podiumOrder.map((idx) => {
                      const s = podium[idx];
                      const rank = idx + 1;
                      const first = rank === 1;
                      return (
                        <div
                          key={s.student_key}
                          className={`relative flex flex-col items-center rounded-2xl border px-3 pb-4 text-center ${
                            first
                              ? "border-amber-200 bg-gradient-to-b from-amber-50 to-transparent pt-6 sm:pb-6"
                              : "border-hairline bg-gradient-to-b from-gray-50 to-transparent pt-4"
                          }`}
                        >
                          <span
                            className={`absolute -top-3 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${rankBadgeClass(rank)}`}
                          >
                            {rank}
                          </span>
                          <Avatar
                            name={s.name}
                            src={s.picture_url}
                            userId={s.student_key}
                            sex={s.sex}
                            size={first ? "xl" : "lg"}
                            tone="brand"
                          />
                          <p className="mt-2 w-full truncate text-sm font-semibold text-gray-900">
                            {s.name}
                          </p>
                          <p className="w-full truncate text-xs text-gray-400">
                            {s.section ?? "No section"}
                          </p>
                          <p
                            className={`mt-2 font-display font-bold tabular-nums ${
                              first ? "text-3xl text-amber-600" : "text-2xl text-brand-600"
                            }`}
                          >
                            {Math.round(s.average_score)}%
                          </p>
                          <p className="text-[11px] text-gray-400">
                            {s.attempts} attempt{s.attempts === 1 ? "" : "s"}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {runnersUp.length > 0 && (
                    <div className="mt-4 grid grid-cols-1 gap-2">
                      {runnersUp.map((s, i) => (
                        <BarRow
                          key={s.student_key}
                          badge={i + 4}
                          badgeClass={rankBadgeClass(i + 4)}
                          label={s.name}
                          sublabel={`${s.section ?? "No section"} · ${s.attempts} attempt${s.attempts === 1 ? "" : "s"}`}
                          fillPct={s.average_score}
                          fillClass="bg-brand-600/[0.06]"
                          trailing={`${Math.round(s.average_score)}%`}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </Panel>
          </div>

          {/* Room Utilization: one gauge per busiest room */}
          <Panel className="mb-6">
            <CardHeading
              icon={faBuilding}
              title="Room Utilization"
              subtitle={`Top ${TOP_ROOMS} busiest rooms`}
              tag={liveTag}
              aside={
                roomList.length > 0 ? (
                  <div className="hidden text-right sm:block">
                    <p className="font-display text-xl font-bold tabular-nums text-gray-900">
                      {overallOccupancy}%
                    </p>
                    <p className="text-xs text-gray-500">
                      {occupiedBeds}/{totalBeds} beds overall
                    </p>
                  </div>
                ) : undefined
              }
            />
            {roomList.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">No rooms configured.</p>
            ) : (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
                {rooms.map((room, i) => {
                  const tone = ROOM_STATUS_TONE[room.status] ?? ROOM_STATUS_TONE.inactive;
                  return (
                    <RoomGauge
                      key={room.id}
                      id={room.id}
                      name={room.name}
                      sublabel={`Room ${room.room_number} · ${tone.label}`}
                      percent={room.utilization_pct}
                      beds={`${room.patients_assigned}/${room.capacity} beds`}
                      colorIndex={i}
                    />
                  );
                })}
              </div>
            )}
          </Panel>

          {/* Section engagement + users by role */}
          <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <Panel className="lg:col-span-2">
              <svg
                viewBox="0 0 220 44"
                className="pointer-events-none absolute right-40 top-5 hidden h-10 w-56 opacity-50 md:block"
                aria-hidden
              >
                <path
                  d="M0 24 H52 L60 24 L66 6 L74 40 L82 24 H120 L128 24 L134 14 L140 24 H220"
                  fill="none"
                  stroke="#2a8a98"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              <CardHeading
                icon={faLayerGroup}
                title="Section Engagement"
                subtitle="Active students against enrollment, per section"
                tag={rangeTag}
              />
              {sectionEngagement.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-400">
                  No sections with students in this scope.
                </p>
              ) : (
                <SectionColumns data={sectionEngagement} />
              )}
              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-hairline pt-5 sm:grid-cols-4">
                <MiniStat
                  icon={faUserGraduate}
                  label="Students"
                  value={totalStudents}
                  chip="bg-blue-50 text-blue-600"
                />
                <MiniStat
                  icon={faUserCheck}
                  label="Active (30d)"
                  value={activeStudents}
                  chip="bg-emerald-50 text-emerald-600"
                />
                <MiniStat
                  icon={faClipboardCheck}
                  label="Attempts"
                  value={summary?.cohort.submitted_attempts ?? 0}
                  chip="bg-amber-50 text-amber-600"
                />
                <MiniStat
                  icon={faLayerGroup}
                  label="Sections"
                  value={sectionEngagement.length}
                  chip="bg-purple-50 text-purple-600"
                />
              </div>
            </Panel>

            <Panel className="flex flex-col">
              <CardHeading
                icon={faUsers}
                title="Users by Role"
                subtitle="Everyone with an account"
                tag={liveTag}
              />
              <RoleDonut counts={roleCounts} />
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
