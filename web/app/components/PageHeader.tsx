import type { ReactNode } from "react";

interface PageHeaderProps {
  badge?: { icon: ReactNode; label: string };
  title: string;
  subtitle: string;
  action?: { icon: ReactNode; onClick: () => void; label: string };
}

export default function PageHeader({ badge, title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200/80 shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] p-4 sm:p-5 mb-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {badge && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100/80 text-[#1B6B7B] rounded-md text-[11px] font-semibold tracking-wide w-fit mb-3">
              {badge.icon}
              {badge.label}
            </div>
          )}
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">{title}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        {action && (
          <button
            onClick={action.onClick}
            aria-label={action.label}
            className="w-10 h-10 sm:w-11 sm:h-11 bg-[#1B6B7B] hover:bg-[#145a63] transition-all rounded-lg flex items-center justify-center text-white shadow-[0_2px_6px_rgba(27,107,123,0.25)] hover:shadow-[0_4px_12px_rgba(27,107,123,0.3)] shrink-0"
          >
            {action.icon}
          </button>
        )}
      </div>
    </div>
  );
}
