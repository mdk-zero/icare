"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBookMedical, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { usePageData } from "../../../lib/use-page-data";
import { fetchStudentRequirements, type StudentCourseRequirements } from "../../../lib/api";
import { TERM_STATUS_LABEL, requirementDetail, type ItemProgress } from "../../../lib/course-progress";
import { ItemStatus, actionLabel, canAct, statusText, useEntryDialog } from "../../courses/progress-ui";
import { TopicIcon, groupByTopic } from "../../courses/topics";

/** One student's semester requirements, shared by the tile and the tab. */
export function useStudentRequirements(studentId: string) {
  return usePageData(`faculty:student-requirements:${studentId}`, () => fetchStudentRequirements(studentId));
}

/** The tile's figure: met / total across the student's running courses. */
export function requirementsTally(data: StudentCourseRequirements | undefined): { done: number; total: number } {
  const running = (data?.courses ?? []).filter((c) => c.offering.status === "current");
  return running.reduce((acc, c) => ({ done: acc.done + c.done, total: acc.total + c.total }), { done: 0, total: 0 });
}

export default function RequirementsTab({ studentId, studentName }: { studentId: string; studentName: string }) {
  const { data, loading, setData } = useStudentRequirements(studentId);
  const courses = data?.data?.courses ?? [];

  const { act, busy, dialog } = useEntryDialog((_student, requirementId, item) =>
    setData((prev) => {
      if (!prev?.data) return prev!;
      return { data: { courses: prev.data.courses.map((c) => applyTick(c, requirementId, item)) } };
    }),
  );

  if (loading) return <div className="h-40 animate-pulse rounded-xl bg-subtle" aria-hidden />;
  if (data?.error) return <p className="py-8 text-center text-gray-500">{data.error}</p>;
  if (courses.length === 0) {
    return (
      <div className="py-8 text-center">
        <FontAwesomeIcon icon={faBookMedical} className="mb-3 h-7 w-7 text-gray-300" />
        <p className="text-gray-500">None of your courses cover this student&rsquo;s section yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {courses.map((c) => (
        <section key={c.offering.id}>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Link href={`/faculty/courses/${c.offering.id}`} className="group flex items-center gap-2">
              <h3 className="font-display text-base font-semibold text-gray-900 group-hover:underline">
                {c.offering.course.code} · {c.offering.course.title}
              </h3>
              <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3 text-gray-300 group-hover:text-brand-600" />
            </Link>
            <span className="text-sm text-gray-500">
              {c.offering.term.name} · {TERM_STATUS_LABEL[c.offering.status]}
            </span>
            <span
              className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                c.total > 0 && c.done === c.total ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
              }`}
            >
              {c.done} of {c.total} met
            </span>
          </div>
          {c.requirements.length === 0 ? (
            <p className="rounded-xl border border-dashed border-gray-300 px-4 py-6 text-center text-sm text-gray-500">
              This course has no requirements yet.
            </p>
          ) : (
            <ul className="divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
              {groupByTopic(c.requirements).flatMap(({ topic, items }) => [
                <li
                  key={topic.key}
                  className={`flex items-center gap-2 bg-subtle/60 px-4 py-2 text-xs font-semibold ${topic.text}`}
                >
                  <TopicIcon topic={topic} size="sm" />
                  {topic.label}
                  <span className="font-normal text-gray-500">· {topic.blurb}</span>
                </li>,
                ...items.map(({ requirement: r, name }) => {
                  const item = c.progress[r.id];
                  const actionable = canAct(r, item);
                  const key = `${studentId}:${r.id}`;
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex w-16 shrink-0">
                        <ItemStatus requirement={r} item={item} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-800">{name}</p>
                        <p className="text-xs text-gray-500">
                          {requirementDetail(r)} · {statusText(r, item)}
                        </p>
                      </div>
                      {actionable && (
                        <button
                          type="button"
                          onClick={() => act(c.offering.id, { id: studentId, name: studentName }, r, name, item)}
                          disabled={busy === key}
                          className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-subtle disabled:opacity-50"
                        >
                          {actionLabel(r, item)}
                        </button>
                      )}
                    </li>
                  );
                }),
              ])}
            </ul>
          )}
        </section>
      ))}
      {dialog}
    </div>
  );
}

function applyTick(
  course: StudentCourseRequirements["courses"][number],
  requirementId: string,
  item: ItemProgress,
): StudentCourseRequirements["courses"][number] {
  if (!course.requirements.some((r) => r.id === requirementId)) return course;
  const before = course.progress[requirementId]?.done ?? false;
  return {
    ...course,
    progress: { ...course.progress, [requirementId]: item },
    done: course.done + Number(item.done) - Number(before),
  };
}
