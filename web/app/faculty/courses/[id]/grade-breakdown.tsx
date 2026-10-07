import { formatGrade, type GradingSplit, type StudentGrade } from "../../../lib/course-grading";

const score = (n: number | null | undefined) => (n === null || n === undefined ? "—" : formatGrade(n));

/**
 * One student's grade, part by part and component by component, with the
 * share of the grade that has scored work behind it.
 */
export default function GradeBreakdown({ split, grade }: { split: GradingSplit; grade: StudentGrade }) {
  return (
    <div className="min-w-0 flex-1">
      <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {split.parts.map((p) => (
          <div key={p.id}>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="font-semibold text-gray-800">
                {p.name} <span className="text-xs font-normal text-gray-500">{p.weight}%</span>
              </dt>
              <dd className="font-semibold tabular-nums text-gray-900">{score(grade.parts[p.id])}</dd>
            </div>
            {p.components.map((c) => (
              <div key={c.id} className="flex items-baseline justify-between gap-3 pl-3 text-xs text-gray-600">
                <dt>
                  {c.name} <span className="text-gray-400">{c.weight}%</span>
                </dt>
                <dd className="tabular-nums">{score(grade.components[c.id])}</dd>
              </div>
            ))}
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs text-gray-500">
        {grade.scored_weight >= 100
          ? "Every part of the grade has scored work."
          : `${grade.scored_weight}% of the grade has scored work so far; the rest is left out until it is scored.`}
      </p>
    </div>
  );
}
