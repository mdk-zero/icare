import type { SelectHTMLAttributes } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown } from "@fortawesome/free-solid-svg-icons";

const filterSelectClassName =
  "cursor-pointer appearance-none pl-4 pr-9 py-2.5 bg-surface border border-gray-400 rounded-xl text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 transition-all";

/** A native `<select>` with its own chevron, pulled in a bit from the edge
 * rather than the browser's default arrow flush against the border. */
export default function FilterSelect({
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select {...props} className={`${filterSelectClassName} ${className}`} />
      <FontAwesomeIcon
        icon={faChevronDown}
        className="pointer-events-none absolute right-3.5 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-500"
      />
    </div>
  );
}
