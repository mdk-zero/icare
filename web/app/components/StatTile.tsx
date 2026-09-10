import type { ReactNode } from "react";

interface StatTileProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  caption?: string;
  /** Clarifying note shown on hover/focus — use when the label could be misread (e.g. "at-risk" as patient risk instead of student risk). */
  tooltip?: string;
  iconBg?: string;
  iconColor?: string;
  onClick?: () => void;
  className?: string;
}

/**
 * Maps the caller's icon colour to the tile's edge accent. Keyed on the literal
 * class strings the 9 call sites pass, plus the brand tokens, so both spellings
 * work while hex literals are migrated.
 */
const barColorMap: Record<string, string> = {
  "text-amber-50": "bg-amber-500",
  "text-amber-600": "bg-amber-500",
  "text-red-50": "bg-red-500",
  "text-red-600": "bg-red-500",
  "text-emerald-50": "bg-emerald-500",
  "text-emerald-600": "bg-emerald-500",
  "text-blue-50": "bg-blue-500",
  "text-blue-600": "bg-blue-500",
  "text-rose-50": "bg-rose-500",
  "text-rose-600": "bg-rose-500",
  "text-green-50": "bg-green-500",
  "text-green-600": "bg-green-500",
  "text-purple-50": "bg-purple-500",
  "text-purple-600": "bg-purple-500",
  "text-gray-50": "bg-gray-500",
  "text-gray-600": "bg-gray-500",
  "text-brand-600": "bg-brand-600",
};

export default function StatTile({
  icon,
  value,
  label,
  caption,
  tooltip,
  iconBg = "bg-brand-600/10",
  iconColor = "text-brand-600",
  onClick,
  className = "",
}: StatTileProps) {
  const barColor = barColorMap[iconColor] ?? "bg-slate-400";
  const Tag = onClick ? "button" : "div";
  const tooltipId = tooltip
    ? `stat-tile-tooltip-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
    : undefined;

  return (
    <div className={`group relative ${className}`}>
      <Tag
        onClick={onClick}
        aria-describedby={tooltipId}
        tabIndex={!onClick && tooltip ? 0 : undefined}
        className={`relative flex w-full items-center gap-3.5 overflow-hidden rounded-xl border border-hairline bg-surface p-3.5 pl-4 text-left shadow-tile transition-all duration-200 hover:shadow-tile-hover focus:outline-none ${
          onClick || tooltip
            ? "focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            : ""
        } ${onClick ? "cursor-pointer hover:-translate-y-0.5" : ""}`}
      >
        <span
          className={`absolute left-0 top-0 h-full w-[3px] ${barColor} transition-all duration-200 group-hover:w-1`}
          aria-hidden
        />

        <span
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg} ${iconColor} transition-transform duration-200 group-hover:scale-105`}
        >
          {icon}
        </span>

        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2">
            <span className="tabular shrink-0 font-display text-[26px] font-semibold leading-none tracking-[-0.02em] text-slate-900">
              {value}
            </span>
            <span className="truncate text-[13px] font-medium text-slate-600">{label}</span>
          </span>
          {caption && (
            <span className="mt-1.5 block truncate font-mono text-[10px] uppercase tracking-[0.1em] text-slate-400">
              {caption}
            </span>
          )}
        </span>
      </Tag>

      {tooltip && (
        <div
          id={tooltipId}
          role="tooltip"
          className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-max max-w-[240px] -translate-x-1/2 scale-95 rounded-lg bg-[#111827] px-3 py-2 text-xs leading-snug text-white opacity-0 shadow-lg transition-all duration-150 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100"
        >
          <span
            className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-[#111827]"
            aria-hidden
          />
          {tooltip}
        </div>
      )}
    </div>
  );
}
