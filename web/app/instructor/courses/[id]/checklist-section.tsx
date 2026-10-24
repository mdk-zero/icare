import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import type { MenuAction } from "../../../components/ActionsMenu";
import type { CourseRequirement } from "../../../lib/api";
import ItemRow from "./requirement-row";

/**
 * A titled list of checklist items outside the grading split: those that
 * don't count toward the grade, or the whole checklist while there is no
 * split. New items start here as not counted.
 */
export default function ChecklistSection({
  title,
  items,
  names,
  locked,
  empty,
  onNew,
  actionsFor,
  noteFor,
}: {
  title: string;
  items: CourseRequirement[];
  /** Requirement id → "Quiz #2". */
  names: Map<string, string>;
  locked: boolean;
  /** Shown in place of the rows when there are none; it carries its own add button. */
  empty?: ReactNode;
  onNew: () => void;
  actionsFor: (requirement: CourseRequirement) => MenuAction[];
  noteFor?: (requirement: CourseRequirement) => string | undefined;
}) {
  return (
    <section className="rounded-xl border border-hairline bg-surface">
      <h3 className="border-b border-hairline px-4 py-2.5 text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h3>
      {items.length > 0 ? (
        <ul className="divide-y divide-hairline px-4">
          {items.map((r) => (
            <ItemRow
              key={r.id}
              requirement={r}
              name={names.get(r.id) ?? ""}
              note={noteFor?.(r)}
              actions={locked ? null : actionsFor(r)}
            />
          ))}
        </ul>
      ) : (
        empty && <div className="px-4 py-8 text-center text-sm text-gray-500">{empty}</div>
      )}
      {!locked && (items.length > 0 || !empty) && (
        <div className="border-t border-hairline px-4 py-2.5">
          <button
            type="button"
            onClick={onNew}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 hover:underline"
          >
            <FontAwesomeIcon icon={faPlus} className="h-2.5 w-2.5" />
            New item
          </button>
        </div>
      )}
    </section>
  );
}

/** The checklist while the course loads. */
export function ChecklistSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      {[3, 2].map((rows, k) => (
        <div key={k} className="animate-pulse overflow-hidden rounded-xl border border-hairline bg-surface">
          <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
            <div className="h-8 w-8 rounded-lg bg-gray-100" />
            <div className="space-y-1.5">
              <div className="h-3.5 w-32 rounded bg-gray-200" />
              <div className="h-3 w-44 rounded bg-gray-100" />
            </div>
          </div>
          {Array.from({ length: rows }).map((_, i) => (
            <div key={i} className="space-y-2 border-b border-hairline px-4 py-3.5 last:border-b-0">
              <div className="h-3.5 w-24 rounded bg-gray-100" />
              <div className="h-3.5 w-72 rounded bg-gray-100" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
