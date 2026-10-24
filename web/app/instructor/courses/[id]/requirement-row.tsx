import type { ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faTriangleExclamation } from "@fortawesome/free-solid-svg-icons";
import ActionsMenu, { type MenuAction } from "../../../components/ActionsMenu";
import type { CourseRequirement } from "../../../lib/api";
import { requirementDetail, topicKey } from "../../../lib/course-progress";
import { TOPICS, TopicIcon } from "../topics";

/**
 * One checklist item: its kind's icon, its "Quiz #2" name, what meets it,
 * and its actions (none when the term is locked).
 */
export default function ItemRow({
  requirement: r,
  name,
  note,
  trailing,
  actions,
}: {
  requirement: CourseRequirement;
  name: string;
  /** A muted line under the detail, e.g. why attendance can't count. */
  note?: string;
  /** Shown before the actions, e.g. the item's share of the grade. */
  trailing?: ReactNode;
  actions: MenuAction[] | null;
}) {
  return (
    <li className="flex items-center gap-3 py-2">
      <TopicIcon topic={TOPICS[topicKey(r)]} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800">{name}</p>
        <p className="text-xs text-gray-500">{requirementDetail(r)}</p>
        {note && <p className="text-xs text-gray-400">{note}</p>}
        {r.removed && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5" />
            The linked activity was deleted
          </span>
        )}
      </div>
      {trailing}
      {actions && <ActionsMenu variant="compact" label={`Actions for ${name}`} actions={actions} />}
    </li>
  );
}
