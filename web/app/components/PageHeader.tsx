import type { ReactNode } from "react";
import LiveClock from "./LiveClock";

interface PageHeaderProps {
  /**
   * Page identity. The icon always renders as the header's mark; the label
   * renders beside it only when it says something the title does not — see
   * `eyebrow` below.
   */
  badge?: { icon: ReactNode; label: string };
  title: string;
  subtitle: string;
  action?: {
    icon: ReactNode;
    onClick: () => void;
    /** Accessible name and tooltip. Carry the reason here, not just the verb. */
    label: string;
    /** Short visible label. Without it the button stays icon-only. */
    text?: string;
    disabled?: boolean;
  };
}

/**
 * A page's masthead. Type on the page, not a card: the panels below carry the
 * surfaces, and stacking one more on top of them only added an edge to look
 * past. A rule closes it off instead, which is all the separation a heading
 * needs.
 *
 * Two thirds of the pages in this app passed a badge whose label was a verbatim
 * copy of the title — a kicker reading "Vitals Monitor" directly above an h1
 * reading "Vitals Monitor". So the kicker is dropped when it only repeats the
 * title, in the component rather than at two dozen call sites, which also stops
 * a screen reader announcing the same words twice. Its icon goes with it: alone
 * above a heading a lone glyph reads as something left behind, and the title
 * carries the page perfectly well without it.
 */
function eyebrow(badge: PageHeaderProps["badge"], title: string): string | null {
  if (!badge) return null;
  const label = badge.label.trim();
  return label.toLowerCase() === title.trim().toLowerCase() ? null : label;
}

/**
 * The entrance cascades down the masthead rather than arriving as one block.
 * Delays are short enough to read as a single gesture, and it plays on the load
 * that brings the app up and not on any navigation after it — see `.no-entrance`
 * in globals.css.
 */
const STEP_MS = 45;
const step = (index: number) => ({ animationDelay: `${index * STEP_MS}ms` });

export default function PageHeader({ badge, title, subtitle, action }: PageHeaderProps) {
  const label = eyebrow(badge, title);

  return (
    <header className="mb-5 border-b border-hairline pb-5">
      <div className="flex items-start justify-between gap-6">
        <div className="min-w-0">
          {label && (
            <p
              className="animate-rise mb-2.5 flex items-center gap-2 font-mono text-[10px] font-medium uppercase leading-none tracking-[0.2em] text-brand-600"
              style={step(0)}
            >
              <span aria-hidden className="[&>svg]:h-3.5 [&>svg]:w-3.5">
                {badge?.icon}
              </span>
              {label}
            </p>
          )}
          <h1
            className="animate-rise text-balance font-display text-[29px] font-semibold leading-[1.03] tracking-[-0.025em] text-slate-900 sm:text-[37px]"
            style={step(1)}
          >
            {title}
          </h1>
          {/* A measure, not a container width: long standfirsts stay readable
              on a wide screen instead of running the full width of the page. */}
          <p
            className="animate-rise mt-2.5 max-w-[62ch] text-pretty text-[15px] leading-relaxed text-slate-500"
            style={step(2)}
          >
            {subtitle}
          </p>
        </div>

        <div className="flex shrink-0 items-start gap-5">
          {/* The wall clock lives with each page's title rather than in the
              sidebar, where it was small and easy to miss. */}
          <LiveClock variant="full" className="animate-rise hidden sm:block" style={step(3)} />
          {action && (
            <button
              onClick={action.onClick}
              disabled={action.disabled}
              aria-label={action.label}
              title={action.label}
              style={step(3)}
              className={`animate-rise group inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-brand-600 text-sm font-semibold text-white transition-colors duration-150 hover:bg-brand-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-45 disabled:hover:bg-brand-600 ${
                action.text ? "w-10 px-0 sm:w-auto sm:px-4" : "w-10"
              }`}
            >
              <span className="transition-transform duration-150 group-hover:scale-110 group-disabled:scale-100">
                {action.icon}
              </span>
              {action.text && <span className="hidden sm:inline">{action.text}</span>}
            </button>
          )}
        </div>
      </div>
      <LiveClock variant="compact" className="animate-rise mt-3 block sm:hidden" style={step(3)} />
    </header>
  );
}
