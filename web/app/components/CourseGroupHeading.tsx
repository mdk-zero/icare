import TruncatedText from "./TruncatedText";

/**
 * A course's heading over its activities: "NCM 114L Care of Older Person · 1st Semester … 3".
 * A long title is cut to one line, whole on hover.
 */
export default function CourseGroupHeading({
  code,
  title,
  term,
  count,
}: {
  code: string;
  title: string;
  term: string | null;
  count: number;
}) {
  return (
    <div className="mb-3 flex min-w-0 items-baseline gap-x-2">
      {code && <h2 className="shrink-0 font-display text-base font-semibold text-gray-900">{code}</h2>}
      <TruncatedText
        text={title}
        className={code ? "text-sm text-gray-600" : "font-display text-base font-semibold text-gray-500"}
      />
      {term && <span className="shrink-0 whitespace-nowrap text-xs text-gray-400">· {term}</span>}
      <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-600">
        {count}
      </span>
    </div>
  );
}
