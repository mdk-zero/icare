import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleInfo } from "@fortawesome/free-solid-svg-icons";

/** A small info button whose explanation shows on hover or focus. */
export default function InfoTip({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <span className="group relative ml-auto inline-flex">
      <button
        type="button"
        aria-label={label}
        className="inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium text-gray-500 transition-colors hover:bg-subtle hover:text-brand-700 focus-visible:bg-subtle focus-visible:outline-none"
      >
        <FontAwesomeIcon icon={faCircleInfo} className="h-3.5 w-3.5" />
        {label}
      </button>
      <span
        role="tooltip"
        className="pointer-events-none absolute right-0 top-full z-20 mt-1.5 w-80 max-w-[80vw] rounded-lg bg-gray-900 px-3 py-2.5 text-xs leading-relaxed text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {children}
      </span>
    </span>
  );
}
