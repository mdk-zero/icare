import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  padding?: "sm" | "md" | "lg";
  hover?: boolean;
}

const paddings = {
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

export default function Card({
  children,
  className = "",
  padding = "md",
  hover = false,
}: CardProps) {
  return (
    <div
      className={`rounded-xl border border-hairline bg-surface shadow-tile ${paddings[padding]} ${
        hover
          ? "transition-all duration-200 hover:shadow-tile-hover hover:border-brand-200/70"
          : ""
      } ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`-mx-4 -mt-4 mb-4 flex items-center justify-between border-b border-hairline px-4 py-3 ${className}`}
    >
      {children}
    </div>
  );
}

/** Section label in the app's instrument voice — mono, spaced, quiet. */
export function CardLabel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-slate-400 ${className}`}
    >
      {children}
    </span>
  );
}
