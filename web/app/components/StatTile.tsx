import type { ReactNode } from "react";
import Link from "next/link";

interface StatTileProps {
  icon: ReactNode;
  value: string | number;
  label: string;
  caption?: string;
  iconBg?: string;
  iconColor?: string;
  onClick?: () => void;
  /**
   * Navigates instead of calling back. Server components can't hand down an
   * `onClick`, so a tile that is really a link says so with an href and keeps
   * the same lift and focus ring the clickable tile has.
   */
  href?: string;
  className?: string;
}

export default function StatTile({
  icon,
  value,
  label,
  caption,
  iconBg = "bg-brand-600/10",
  iconColor = "text-brand-600",
  onClick,
  href,
  className = "",
}: StatTileProps) {
  const interactive = Boolean(onClick || href);

  const classes = `group flex items-center gap-3.5 overflow-hidden rounded-xl border border-hairline bg-surface p-3.5 text-left shadow-tile transition-all duration-200 hover:shadow-tile-hover ${
    interactive
      ? "cursor-pointer hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
      : ""
  } ${className}`;

  // Spans throughout: the tile renders as a <button> when it has an onClick,
  // and a button may not contain block-level children.
  const body = (
    <>
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
