import Link from "next/link";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowDown, faArrowUp } from "@fortawesome/free-solid-svg-icons";

interface StatTileProps {
  icon: IconDefinition;
  value: string | number;
  label: string;
  caption?: string;
  iconBg?: string;
  iconColor?: string;
  /** Colors the value itself, for a figure whose reading is the status
   * (a risk label, say) rather than a count. */
  valueColor?: string;
  /**
   * Percent change against a comparison period, shown as a trend badge ahead
   * of the caption. `null` is a comparison that couldn't be made and shows a
   * dash; leave it out entirely for a tile that has no comparison.
   */
  change?: number | null;
  /** Whether an increasing value is the good outcome (scores) or the bad one
   * (an at-risk count) — flips which direction is colored green. */
  goodDirection?: "up" | "down";
  onClick?: () => void;
  /**
   * Navigates instead of calling back. Server components can't hand down an
   * `onClick`, so a tile that is really a link says so with an href and keeps
   * the same lift and focus ring the clickable tile has.
   */
  href?: string;
  className?: string;
}

/**
 * KPI tile with a label + icon header, a large value, and an optional trend
 * and caption line — the Analytics dashboard's card, sized to fill its grid
 * cell rather than hugging its content.
 */
export default function StatTile({
  icon,
  value,
  label,
  caption,
  iconBg = "bg-brand-600/10",
  iconColor = "text-brand-600",
  valueColor = "text-gray-900",
  change,
  goodDirection = "up",
  onClick,
  href,
  className = "",
}: StatTileProps) {
  const interactive = Boolean(onClick || href);
  const isUp = (change ?? 0) >= 0;
  const isGood = goodDirection === "up" ? isUp : !isUp;

  const classes = `group flex flex-col rounded-2xl border border-hairline bg-surface p-4 text-left shadow-tile transition-all duration-200 ${
    interactive
      ? "cursor-pointer hover:-translate-y-0.5 hover:shadow-tile-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
      : ""
  } ${className}`;

  // Spans throughout: the tile renders as a <button> when it has an onClick,
  // and a button may not contain block-level children.
  const body = (
    <>
      <span className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-xs font-bold uppercase tracking-wider text-gray-400">
          {label}
        </span>
        <span
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full ${iconBg} ${iconColor}`}
        >
          <FontAwesomeIcon icon={icon} className="h-11 w-11" />
        </span>
      </span>
      <span className={`mt-2 block font-display text-4xl font-bold tabular-nums ${valueColor}`}>
        {value}
      </span>
      {(change !== undefined || caption) && (
        <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
          {change === null && <span className="font-semibold text-gray-400">—</span>}
          {change != null && (
            <span
              className={`flex items-center gap-1 font-semibold ${isGood ? "text-emerald-600" : "text-rose-600"}`}
            >
              <FontAwesomeIcon icon={isUp ? faArrowUp : faArrowDown} className="h-2.5 w-2.5" />
              {Math.abs(change).toFixed(1)}%
            </span>
          )}
          {caption && <span className="text-gray-400">{caption}</span>}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={classes}>
        {body}
      </Link>
    );
  }

  const Tag = onClick ? "button" : "div";
  return (
    <Tag onClick={onClick} className={classes}>
      {body}
    </Tag>
  );
}
