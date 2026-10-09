/** A course's heading over its activities: "NCM 101 Health Assessment · 1st Semester … 3". */
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
    <div className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-1">
      {code && <h2 className="font-display text-base font-semibold text-gray-900">{code}</h2>}
      <span className={code ? "text-sm text-gray-600" : "font-display text-base font-semibold text-gray-500"}>
        {title}
      </span>
      {term && <span className="text-xs text-gray-400">· {term}</span>}
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-gray-600">
        {count}
      </span>
    </div>
  );
}
