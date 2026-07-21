import type { ReactNode } from "react";

interface StatCardProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  iconBg?: string;
  iconColor?: string;
  hoverBorder?: string;
  className?: string;
}

export default function StatCard({
  icon,
  value,
  label,
  iconBg = "bg-brand-600/10",
  iconColor = "text-brand-600",
  hoverBorder = "hover:border-brand-600/30",
  className = "",
}: StatCardProps) {
  return (
    <div
      className={`bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-3.5 ${hoverBorder} hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06)] transition-all duration-200 ${className}`}
    >
      <div className="flex items-center gap-3.5">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${iconBg} ${iconColor}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-lg font-bold text-gray-900 leading-none mb-0.5">{value}</p>
          <p className="text-[11px] font-medium text-gray-500 tracking-wide">{label}</p>
        </div>
      </div>
    </div>
  );
}
