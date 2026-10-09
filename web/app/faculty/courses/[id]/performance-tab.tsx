"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChartLine,
  faMagnifyingGlass,
  faPercent,
  faUsers,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import Avatar from "../../../components/Avatar";
import { SkeletonProgressGrid } from "../../../components/skeletons";
import { usePageData } from "../../../lib/use-page-data";
import { fetchCourseProgress } from "../../../lib/api";
import {
  computeGrades,
  formatGrade,
  type GradePart,
} from "../../../lib/course-grading";

/** Part k's colour, the same slots the Grading tab gives its parts. */
const partColor = (k: number) => `var(--color-group-${(k % 6) + 1})`;

const mean = (values: (number | null | undefined)[]) => {
  const real = values.filter((v): v is number => typeof v === "number");
  return real.length ? real.reduce((a, b) => a + b, 0) / real.length : null;
};

const num = (n: number) => `${Math.round(n * 10) / 10}`;

/** Green from the usual passing mark, amber below it. */
const PASSING = 75;
const tone = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "text-gray-400"
    : n >= PASSING
      ? "text-emerald-700"
      : "text-amber-700";

/**
 * The course's grades in summary: for each student, their average in every
 * part of the grading split ("Written Exams", "Laboratory & Skills", ...)
 * and the final grade those make, each part's average times its percent,
 * added up. It reads the same progress as the Progress tab (and shares its
 * cache), so a score entered there shows here at once.
 *
 * A part with no scored work yet is left out and the rest rescaled, as on
 * the Progress tab, so mid-term a grade reads as the grade so far.
 */
export default function PerformanceTab({
  offeringId,
  signature,
  onOpenGrading,
}: {
  offeringId: string;
  signature: string;
  onOpenGrading: () => void;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const { data, loading } = usePageData(
    `faculty:course-progress:${offeringId}:${signature}`,
    () => fetchCourseProgress(offeringId),
  );
  const progress = data?.data ?? null;
  const graded = useMemo(
    () =>
      computeGrades(
        progress?.grading ?? null,
        progress?.requirements ?? [],
        progress?.progress ?? {},
      ),
    [progress],
  );
  const parts: GradePart[] =
    progress?.grading && !graded.invalid ? progress.grading.parts : [];
  // An automatic split (070): every item counts the same, so there are no percents.
  const auto = !!progress?.grading?.auto;
  const itemCount = parts.reduce((n, p) => n + p.items.length, 0);

  const groupLabels = useMemo(
    () =>
      [
        ...new Set(
          (progress?.students ?? []).map((s) => s.group_label).filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })),
    [progress?.students],
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (
      [...(progress?.students ?? [])]
        .filter(
          (s) =>
            (!group || s.group_label === group) &&
            (!q || s.name.toLowerCase().includes(q)),
        )
        // By section, then group (the label reads "BSN 3101 · Group A"), then name A–Z.
        .sort(
          (a, b) =>
            (a.group_label || "~").localeCompare(
              b.group_label || "~",
              undefined,
              { numeric: true },
            ) || a.name.localeCompare(b.name),
        )
    );
  }, [progress?.students, query, group]);

  if (loading) return <SkeletonProgressGrid />;
  if (data?.error) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        {data.error}
      </div>
    );
  }
  if (!progress?.grading || graded.invalid) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-surface px-6 py-12 text-center">
        <FontAwesomeIcon
          icon={faPercent}
          className="mb-3 h-7 w-7 text-gray-300"
        />
        <p className="font-semibold text-gray-700">
          {graded.invalid
            ? "The grading split needs fixing"
            : "No grading split yet"}
        </p>
        <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
          {graded.invalid
            ? "Its percents don't add up, so no grade can be worked out. Fix it on the Grading tab."
            : "Set up the parts of the grade on the Grading tab, like Written Exams 30% and Laboratory & Skills 70%. Each student's performance shows here."}
        </p>
        <button
          type="button"
          onClick={onOpenGrading}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          <FontAwesomeIcon icon={faPercent} className="h-3.5 w-3.5" />
          Open Grading
        </button>
      </div>
    );
  }
  if (progress.students.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-surface px-6 py-12 text-center">
        <FontAwesomeIcon
          icon={faUsers}
          className="mb-3 h-7 w-7 text-gray-300"
        />
        <p className="font-semibold text-gray-700">No students yet</p>
      </div>
    );
  }

  const gradeOf = (id: string) => graded.grades[id];
  const classPart = (partId: string) =>
    mean(rows.map((s) => gradeOf(s.id)?.parts[partId]));
  const classFinal = mean(rows.map((s) => gradeOf(s.id)?.grade));
  const passing = rows.filter(
    (s) => (gradeOf(s.id)?.grade ?? -1) >= PASSING,
  ).length;
  const withGrade = rows.filter((s) => gradeOf(s.id)?.grade != null).length;

  return (
    <div className="space-y-4">
      {/* How the final grade is made */}
      <section className="rounded-xl border border-hairline bg-surface p-4">
        <h3 className="font-display text-sm font-semibold text-gray-900">
          How the final grade is computed
        </h3>
        {auto ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-gray-700">
            <span className="font-semibold text-gray-900">Final grade =</span>
            average of all{" "}
            <span className="font-semibold tabular-nums">{itemCount}</span>{" "}
            items (
            {parts.map((p, k) => (
              <span key={p.id} className="inline-flex items-center gap-1.5">
                {k > 0 && <span className="text-gray-400">+</span>}
                <span className="inline-flex items-center gap-1.5 rounded-md bg-subtle px-2 py-0.5">
                  <span
                    className="h-2 w-2 rounded-[3px]"
                    style={{ background: partColor(k) }}
                    aria-hidden
                  />
                  {p.items.length} {p.name}
                </span>
              </span>
            ))}
            )
          </p>
        ) : (
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-gray-700">
            <span className="font-semibold text-gray-900">Final grade =</span>
            {parts.map((p, k) => (
              <span key={p.id} className="inline-flex items-center gap-1.5">
                {k > 0 && <span className="text-gray-400">+</span>}
                <span className="inline-flex items-center gap-1.5 rounded-md bg-subtle px-2 py-0.5">
                  <span
                    className="h-2 w-2 rounded-[3px]"
                    style={{ background: partColor(k) }}
                    aria-hidden
                  />
                  {p.name} average ×{" "}
                  <span className="font-semibold tabular-nums">
                    {p.weight}%
                  </span>
                </span>
              </span>
            ))}
          </p>
        )}
        <p className="mt-2 text-xs text-gray-500">
          {auto
            ? "Each part's column is the average of its own items, so a part with more items counts for more. "
            : ""}
          A part&apos;s average comes from its items&apos; scores. A part with
          no scored work yet is left out and the rest count for the whole, so a
          grade reads as the grade so far.
        </p>
      </section>

      {/* Class summary */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-[repeat(auto-fit,minmax(10rem,1fr))]">
        {parts.map((p, k) => {
          const avg = classPart(p.id);
          return (
            <div
              key={p.id}
              className="rounded-xl border border-hairline bg-surface p-3.5"
            >
              <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                <span
                  className="h-2 w-2 shrink-0 rounded-[3px]"
                  style={{ background: partColor(k) }}
                  aria-hidden
                />
                <span className="truncate">{p.name}</span>
                <span className="ml-auto tabular-nums text-gray-400">
                  {auto ? `${p.items.length} items` : `${p.weight}%`}
                </span>
              </p>
              <p
                className={`mt-1 font-display text-2xl font-semibold tabular-nums ${tone(avg)}`}
              >
                {avg === null ? "—" : formatGrade(avg)}
              </p>
              <p className="text-[11px] text-gray-500">class average</p>
            </div>
          );
        })}
        <div className="rounded-xl border border-brand-600/30 bg-brand-600/[0.05] p-3.5">
          <p className="text-xs font-semibold text-brand-800">Final grade</p>
          <p
            className={`mt-1 font-display text-2xl font-semibold tabular-nums ${tone(classFinal)}`}
          >
            {classFinal === null ? "—" : formatGrade(classFinal)}
          </p>
          <p className="text-[11px] text-gray-500">
            class average · {passing} of {withGrade} at {PASSING}%+
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative min-w-[14rem] flex-1 sm:max-w-sm">
          <span className="sr-only">Search students</span>
          <FontAwesomeIcon
            icon={faMagnifyingGlass}
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search students"
            className="w-full rounded-xl border border-gray-300 bg-surface py-2.5 pl-9 pr-9 text-sm text-gray-900 placeholder:text-gray-500 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
            </button>
          )}
        </label>
        {groupLabels.length > 1 && (
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value)}
            aria-label="Group"
            className="rounded-xl border border-gray-300 bg-surface px-3 py-2.5 text-sm text-gray-800 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
          >
            <option value="">All groups</option>
            {groupLabels.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* One row per student */}
      <div className="overflow-clip rounded-xl border border-hairline bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-hairline bg-subtle px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Student
                </th>
                {parts.map((p, k) => (
                  <th
                    key={p.id}
                    className="border-b border-hairline bg-subtle px-3 py-3 text-right align-bottom"
                  >
                    <span className="flex items-center justify-end gap-1.5 text-xs font-semibold text-gray-700">
                      <span
                        className="h-2 w-2 shrink-0 rounded-[3px]"
                        style={{ background: partColor(k) }}
                        aria-hidden
                      />
                      {p.name}
                    </span>
                    <span className="block text-[11px] font-medium tabular-nums text-gray-400">
                      {auto
                        ? `${p.items.length} item${p.items.length === 1 ? "" : "s"}`
                        : `${p.weight}% of grade`}
                    </span>
                  </th>
                ))}
                <th className="border-b border-hairline bg-subtle px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-wider text-gray-500">
                  Final grade
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s, i) => {
                const g = gradeOf(s.id);
                // A heading row where a new section and group starts.
                const startsGroup =
                  i === 0 || rows[i - 1].group_label !== s.group_label;
                const scored = parts.filter((p) => g?.parts[p.id] != null);
                const formula = auto
                  ? `average of ${Math.round(((g?.scored_weight ?? 0) / 100) * itemCount)} of ${itemCount} items`
                  : scored
                      .map((p) => `${num(g!.parts[p.id]!)} × ${p.weight}%`)
                      .join(" + ");
                return (
                  <Fragment key={s.id}>
                    {startsGroup && (
                      <tr>
                        <th
                          colSpan={parts.length + 2}
                          scope="colgroup"
                          className="sticky left-0 border-b border-hairline bg-subtle/60 px-4 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500"
                        >
                          {s.group_label || "No group"}
                          <span className="ml-2 font-medium normal-case tracking-normal text-gray-400">
                            {
                              rows.filter(
                                (x) => x.group_label === s.group_label,
                              ).length
                            }{" "}
                            students
                          </span>
                        </th>
                      </tr>
                    )}
                    <tr className="group">
                      <td className="sticky left-0 z-10 border-b border-hairline bg-surface px-4 py-2.5 group-hover:bg-subtle">
                        <div className="flex items-center gap-3">
                          <Avatar
                            name={s.name}
                            src={s.picture_url}
                            userId={s.id}
                            sex={s.sex}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <Link
                              href={`/faculty/students/${s.id}`}
                              className="block truncate font-medium text-gray-800 hover:underline"
                            >
                              {s.name}
                            </Link>
                            <p className="truncate text-xs text-gray-500">
                              {s.group_label}
                            </p>
                          </div>
                        </div>
                      </td>
                      {parts.map((p) => {
                        const v = g?.parts[p.id];
                        return (
                          <td
                            key={p.id}
                            className={`border-b border-hairline px-3 py-2.5 text-right font-semibold tabular-nums group-hover:bg-subtle ${tone(v)}`}
                          >
                            {v == null ? "—" : formatGrade(v)}
                          </td>
                        );
                      })}
                      <td className="border-b border-hairline px-4 py-2.5 text-right group-hover:bg-subtle">
                        <span
                          className={`font-display text-base font-semibold tabular-nums ${tone(g?.grade)}`}
                        >
                          {g?.grade == null ? "—" : formatGrade(g.grade)}
                        </span>
                        {g?.grade != null && (
                          <span
                            className="block text-[11px] tabular-nums text-gray-500"
                            title="Each part's average times its percent"
                          >
                            {formula}
                            {(auto
                              ? (g.scored_weight ?? 0) < 100
                              : scored.length < parts.length) && " · so far"}
                          </span>
                        )}
                      </td>
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="sticky left-0 z-10 bg-subtle px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Class average
                </td>
                {parts.map((p) => {
                  const avg = classPart(p.id);
                  return (
                    <td
                      key={p.id}
                      className={`bg-subtle px-3 py-3 text-right font-semibold tabular-nums ${tone(avg)}`}
                    >
                      {avg === null ? "—" : formatGrade(avg)}
                    </td>
                  );
                })}
                <td
                  className={`bg-subtle px-4 py-3 text-right font-display text-base font-semibold tabular-nums ${tone(classFinal)}`}
                >
                  {classFinal === null ? "—" : formatGrade(classFinal)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      {rows.length === 0 && (
        <p className="text-center text-sm text-gray-500">No students match.</p>
      )}
      <p className="flex items-center gap-1.5 text-xs text-gray-500">
        <FontAwesomeIcon icon={faChartLine} className="h-3 w-3" />
        Green is {PASSING}% and above. Scores come from graded work and the
        scores entered on the Progress tab.
      </p>
    </div>
  );
}
