import type { ReactNode } from "react";

interface PageHeaderProps {
  badge?: { icon: ReactNode; label: string };
  title: string;
  subtitle: string;
  action?: { icon: ReactNode; onClick: () => void; label: string };
}

export default function PageHeader({ badge, title, subtitle, action }: PageHeaderProps) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 sm:p-8 mb-6">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          {badge && (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-gray-100 text-[#1B6B7B] rounded-full text-xs sm:text-sm font-medium w-fit mb-3">
              {badge.icon}
              {badge.label}
            </div>
          )}
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-500 mt-1">{subtitle}</p>
        </div>
        {action && (
          <button
            onClick={action.onClick}
            aria-label={action.label}
            className="w-12 h-12 sm:w-14 sm:h-14 bg-[#1B6B7B] hover:bg-[#145a63] transition-colors rounded-xl flex items-center justify-center text-white shadow-lg shadow-[#1B6B7B]/20 shrink-0"
          >
            {action.icon}
          </button>
        )}
      </div>
    </div>
  );
}
