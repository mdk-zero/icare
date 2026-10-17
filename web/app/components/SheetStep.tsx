"use client";

import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCheck } from "@fortawesome/free-solid-svg-icons";

/**
 * A numbered step of a top-to-bottom form, as the patient case builder lays
 * them out: the numeral turns into a tick once the step is done, and a rail
 * joins each step to the next.
 */
export default function SheetStep({
  n,
  title,
  hint,
  done,
  tag,
  last,
  children,
}: {
  n: number;
  title: string;
  hint?: ReactNode;
  done?: boolean;
  tag?: ReactNode;
  last?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      className="relative grid grid-cols-[2.25rem_1fr] gap-x-3 sm:gap-x-4 animate-rise"
      style={{ animationDelay: `${n * 60}ms` }}
    >
      {!last && <span aria-hidden className="absolute left-[1.125rem] top-10 bottom-0 w-px bg-hairline" />}
      <span
        aria-hidden
        className={`relative z-[1] flex h-9 w-9 items-center justify-center rounded-full border font-display text-[13px] font-semibold tabular-nums transition-colors ${
          done ? "border-brand-600 bg-brand-600 text-white" : "border-brand-200 bg-surface text-brand-600"
        }`}
      >
        {done ? <FontAwesomeIcon icon={faCheck} className="h-3.5 w-3.5" /> : String(n).padStart(2, "0")}
      </span>
      <div className={`min-w-0 ${last ? "" : "pb-8"}`}>
        <div className="flex min-h-9 flex-wrap items-center gap-x-2 gap-y-0.5">
          <h2 className="font-display text-base font-semibold text-gray-900">{title}</h2>
          {tag}
        </div>
        {hint && <p className="-mt-0.5 text-xs text-gray-500">{hint}</p>}
        <div className="mt-3.5">{children}</div>
      </div>
    </section>
  );
}
