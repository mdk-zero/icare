/**
 * A labelled bar with its percentage, for long work that can say how far along
 * it is — a CSV import row by row, an ML run step by step — where a spinner
 * alone gives no sense of how much is left.
 */
export default function ProgressBar({
  value,
  label,
  compact = false,
  className = "",
}: {
  /** Fraction done, 0 to 1. */
  value: number;
  /** What is in progress; also the bar's accessible name. */
  label: string;
  /**
   * The bar alone, thinner, with the label as its tooltip — for hanging under
   * a button that already shows the percentage.
   */
  compact?: boolean;
  className?: string;
}) {
  const percent = Math.round(Math.min(1, Math.max(0, value)) * 100);
  return (
    <div className={className} title={compact ? label : undefined}>
      {!compact && (
        <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
          <span className="text-gray-600">{label}</span>
          <span className="font-semibold tabular-nums text-brand-600">{percent}%</span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        className={`overflow-hidden rounded-full bg-gray-200 ${compact ? "h-1.5" : "h-2"}`}
      >
        <div
          className="h-full rounded-full bg-brand-600 transition-[width] duration-300 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
