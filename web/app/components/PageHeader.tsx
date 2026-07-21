import type { ReactNode } from "react";

interface PageHeaderProps {
  badge?: { icon: ReactNode; label: string };
  title: string;
  subtitle: string;
  action?: { icon: ReactNode; onClick: () => void; label: string };
}

export default function PageHeader({ badge, title, subtitle, action }: PageHeaderProps) {
  return (
    <header className="animate-rise relative overflow-hidden bg-surface rounded-2xl border border-hairline shadow-tile p-5 sm:p-6 mb-4">
      {/* Brand light falling from the top-right, so the header has depth. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(70% 130% at 100% 0%, rgb(27 107 123 / 0.07) 0%, transparent 70%)",
        }}
      />
      {/* Spine, tying every page back to the sidebar. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-brand-400 via-brand-600 to-brand-800"
      />

      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          {badge && (
            <div className="inline-flex items-center gap-1.5 mb-3 rounded-full bg-brand-50 ring-1 ring-brand-100 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-brand-700">
              {badge.icon}
              {badge.label}
            </div>
          )}
          <h1 className="font-display text-[26px] sm:text-[31px] font-semibold leading-[1.08] tracking-[-0.015em] text-slate-900">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">{subtitle}</p>
        </div>

        {action && (
          <button
            onClick={action.onClick}
            aria-label={action.label}
            title={action.label}
            className="group shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white bg-gradient-to-br from-brand-500 to-brand-700 shadow-[0_4px_14px_-2px_rgb(27_107_123_/_0.45)] ring-1 ring-brand-800/20 transition-all hover:shadow-[0_8px_22px_-4px_rgb(27_107_123_/_0.55)] hover:-translate-y-0.5 active:translate-y-0"
          >
            <span className="transition-transform duration-200 group-hover:scale-110">
              {action.icon}
            </span>
          </button>
        )}
      </div>
    </header>
  );
}
