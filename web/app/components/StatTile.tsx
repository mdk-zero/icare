import type { ReactNode } from "react";

interface StatTileProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  caption?: string;
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
  "text-[#1B6B7B]": "bg-brand-600",
  "text-brand-600": "bg-brand-600",
};

export default function StatTile({
  icon,
  value,
  label,
  caption,
  iconBg = "bg-brand-600/10",
  iconColor = "text-brand-600",
  onClick,
  className = "",
}: StatTileProps) {
  const barColor = barColorMap[iconColor] ?? "bg-slate-400";
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick}
      className={`group relative flex items-center gap-3.5 overflow-hidden rounded-xl border border-hairline bg-surface p-3.5 pl-4 text-left shadow-tile transition-all duration-200 hover:shadow-tile-hover ${
        onClick
          ? "cursor-pointer hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
          : ""
      } ${className}`}
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
  );
}
