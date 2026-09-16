import type { ReactNode } from "react";

interface PageHeaderProps {
  /**
   * Page identity. The icon always renders as the header's glyph; the label
   * renders as an eyebrow above the title only when it says something the title
   * does not — see `eyebrow` below.
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
 * A page's masthead: glyph, optional eyebrow, title, standfirst, one action.
 *
 * Two thirds of the pages in this app passed a badge whose label was a verbatim
 * copy of the title — an eyebrow reading "Vitals Monitor" directly above an h1
 * reading "Vitals Monitor". So the eyebrow is dropped when it only repeats the
 * title, in the component rather than at two dozen call sites, which also stops
 * a screen reader announcing the same words twice. The badge's icon is kept
 * either way, because that is the part carrying the page's identity.
 */
function eyebrow(badge: PageHeaderProps["badge"], title: string): string | null {
  if (!badge) return null;
  const label = badge.label.trim();
  return label.toLowerCase() === title.trim().toLowerCase() ? null : label;
}

/**
 * The entrance cascades down the masthead — glyph, eyebrow, title, standfirst,
 * action — rather than arriving as one block. Delays are short enough to read
 * as a single gesture. The global prefers-reduced-motion rule in globals.css
 * flattens all of it.
 */
const STEP_MS = 45;
const step = (index: number) => ({ animationDelay: `${index * STEP_MS}ms` });

export default function PageHeader({ badge, title, subtitle, action }: PageHeaderProps) {
  const label = eyebrow(badge, title);

  return (
    <header className="animate-rise relative isolate mb-4 overflow-hidden rounded-2xl border border-hairline bg-surface p-5 shadow-tile sm:p-6">
      {/*
       * Three stacked layers make the surface read as paper rather than a flat
       * fill: a fine dot grid, a brand bloom from the top-right, and a hairline
       * of light along the top edge. `currentColor` carries the tint so one
       * `dark:` variant on the wrapper rethemes the whole texture — the colour
       * tokens are already inverted for dark, inline gradients cannot use
       * variants, and this keeps them from having to.
       */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 text-brand-600/[0.07] dark:text-brand-400/[0.09]"
        style={{
          backgroundImage: "radial-gradient(currentColor 1px, transparent 0)",
          backgroundSize: "20px 20px",
          backgroundPosition: "-1px -1px",
          maskImage: "linear-gradient(108deg, #000 0%, transparent 62%)",
          WebkitMaskImage: "linear-gradient(108deg, #000 0%, transparent 62%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 text-brand-500/[0.10] dark:text-brand-400/[0.14]"
        style={{
          backgroundImage:
            "radial-gradient(75% 130% at 100% 0%, currentColor 0%, transparent 68%)",
        }}
      />
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent dark:via-white/10"
      />

      {/* Spine, tying every page back to the sidebar. */}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-full w-[3px] bg-gradient-to-b from-brand-400 via-brand-600 to-brand-800"
      />

      <div className="flex items-start gap-4">
        {badge && (
          <span
            aria-hidden
            className="animate-rise grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-600/[0.08] text-brand-600 ring-1 ring-inset ring-brand-600/15 sm:h-12 sm:w-12 dark:bg-brand-500/[0.14] dark:ring-brand-400/20"
            style={step(0)}
          >
            {badge.icon}
          </span>
        )}

        <div className="min-w-0 flex-1">
          {label && (
            <p
              className="animate-rise mb-1.5 font-mono text-[10px] font-medium uppercase leading-none tracking-[0.18em] text-brand-700"
              style={step(1)}
            >
              {label}
            </p>
          )}
          <h1
            className="animate-rise text-balance font-display text-[27px] font-semibold leading-[1.06] tracking-[-0.02em] text-slate-900 sm:text-[33px]"
            style={step(2)}
          >
            {title}
          </h1>
          {/* A measure, not a container width: long standfirsts stay readable
              on a wide screen instead of running the full width of the card. */}
          <p
            className="animate-rise mt-2 max-w-[62ch] text-pretty text-sm leading-relaxed text-slate-500"
            style={step(3)}
          >
            {subtitle}
          </p>
        </div>

        {action && (
          <button
            onClick={action.onClick}
            disabled={action.disabled}
            aria-label={action.label}
            title={action.label}
            style={step(4)}
            className={`animate-rise group relative inline-flex h-11 shrink-0 items-center justify-center gap-2.5 overflow-hidden rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-semibold text-white shadow-[0_4px_14px_-2px_rgb(27_107_123_/_0.45)] ring-1 ring-brand-800/25 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_8px_22px_-4px_rgb(27_107_123_/_0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:translate-y-0 disabled:opacity-50 disabled:shadow-none disabled:hover:translate-y-0 sm:h-12 ${
              action.text ? "w-11 px-0 sm:w-auto sm:pl-4 sm:pr-5" : "w-11 sm:w-12"
            }`}
          >
            {/* Sheen, swept on hover — the one flourish on an otherwise quiet
                surface, and the only thing here that moves after load. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-500 group-hover:translate-x-full group-disabled:hidden"
            />
            <span className="transition-transform duration-200 group-hover:scale-110 group-disabled:scale-100">
              {action.icon}
            </span>
            {action.text && <span className="hidden sm:inline">{action.text}</span>}
          </button>
        )}
      </div>
    </header>
  );
}
