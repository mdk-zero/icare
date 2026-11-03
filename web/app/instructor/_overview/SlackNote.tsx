import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";

/**
 * A closing note that takes up a card's spare height, so a short list doesn't
 * leave a hole: one line when there's little room, a full message when there's
 * plenty. Its parent needs `flex-1 [container-type:size]`, which is what sizes
 * it by the room left rather than by its own content.
 */
export default function SlackNote({
  title,
  detail,
  className = "flex px-5",
}: {
  title: string;
  detail: string;
  className?: string;
}) {
  return (
    <div
      className={`h-full items-center gap-2.5 text-[13px] text-slate-500 roomy:flex-col roomy:justify-center roomy:gap-2 roomy:text-center ${className}`}
    >
      <span className="flex shrink-0 items-center justify-center rounded-full text-emerald-500 roomy:h-11 roomy:w-11 roomy:bg-emerald-50 roomy:text-emerald-600">
        <FontAwesomeIcon icon={faCircleCheck} className="h-3.5 w-3.5 roomy:h-5 roomy:w-5" />
      </span>
      <p className="roomy:text-base roomy:font-medium roomy:text-slate-900">{title}</p>
      <p className="hidden max-w-xs text-balance text-sm roomy:block">{detail}</p>
    </div>
  );
}
