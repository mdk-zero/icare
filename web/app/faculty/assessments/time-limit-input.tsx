"use client";

import { formatTimeLimit, parseTimeLimit } from "@/app/lib/time-limit";

/**
 * The time limit field: "MM:SS" with "min" after it. What is typed is tidied
 * on leaving the field ("5" becomes 05:00); empty means no limit.
 */
export default function TimeLimitInput({
  id,
  value,
  onChange,
  disabled,
  className,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const parsed = parseTimeLimit(value);
  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d:]/g, "").slice(0, 6))}
        onBlur={() => {
          if (parsed !== "invalid") onChange(formatTimeLimit(parsed));
        }}
        placeholder="00:00"
        disabled={disabled}
        aria-invalid={parsed === "invalid"}
        aria-describedby={`${id}-hint`}
        className={`${className ?? ""} pr-12 tabular-nums`}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">min</span>
      <p id={`${id}-hint`} className={`mt-1 text-xs ${parsed === "invalid" ? "text-red-600" : "text-gray-500"}`}>
        {parsed === "invalid" ? "Use minutes and seconds, like 15:00." : "Leave it at 00:00 for no time limit."}
      </p>
    </div>
  );
}
