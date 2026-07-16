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

export default function StatTile({
  icon,
  value,
  label,
  caption,
  iconBg = "bg-[#1B6B7B]/10",
  iconColor = "text-[#1B6B7B]",
  onClick,
  className = "",
}: StatTileProps) {
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
    "text-[#1B6B7B]": "bg-[#1B6B7B]",
  };
  const barColor = barColorMap[iconColor] ?? "bg-gray-500";
  const Tag = onClick ? "button" : "div";

  return (
    <Tag
      onClick={onClick}
      className={`group relative flex items-center gap-3.5 bg-white rounded-xl border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-3.5 pl-4 text-left overflow-hidden transition-all hover:shadow-[0_4px_12px_-2px_rgba(0,0,0,0.08)] ${onClick ? "cursor-pointer hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B6B7B] focus-visible:ring-offset-2" : ""} ${className}`}
    >
      <span className={`absolute left-0 top-0 h-full w-0.5 ${barColor}`} aria-hidden />

      <span className={`shrink-0 w-10 h-10 rounded-full ${iconBg} ${iconColor} flex items-center justify-center transition-transform group-hover:scale-105`}>
        {icon}
      </span>

      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-gray-900 tabular-nums shrink-0">{value}</span>
          <span className="text-sm font-medium text-gray-700 truncate">{label}</span>
        </span>
        {caption && <span className="text-xs text-gray-400 truncate block">{caption}</span>}
      </span>
    </Tag>
  );
}
