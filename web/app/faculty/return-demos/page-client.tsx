"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDay,
  faClipboardCheck,
  faHandHoldingMedical,
  faPenToSquare,
  faPlus,
  faSearch,
  faTrash,
  faTriangleExclamation,
  faUserPlus,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import {
  deleteReturnDemo,
  fetchMyCourses,
  fetchReturnDemos,
  type ReturnDemoSummary,
} from "../../lib/api";
import { groupByCourse, numberWithinCourse } from "../../lib/course-groups";
import { RETURN_DEMOS_NEED_MIGRATION } from "../../lib/scenario-kind";
import { usePageData } from "../../lib/use-page-data";
import PageHeader from "../../components/PageHeader";
import CourseGroupHeading from "../../components/CourseGroupHeading";
import ActionsMenu from "../../components/ActionsMenu";
import ConfirmModal from "../../components/ConfirmModal";
import { SkeletonScenarioCard } from "../../components/skeletons";
import { toast } from "../../components/Toast";
import AssignModal from "./assign-modal";

const NO_DEMOS: ReturnDemoSummary[] = [];

/** "Skill 1-1 · Assessing Body Temperature": the task title minus its "(Skill 1-1)". */
const skillLabel = (s: { id: string; title: string }) =>
  s.id ? `${s.id} · ${s.title.replace(/\s*\(Skill [\d-]+\)\s*$/, "")}` : s.title;

/**
 * Teaching › Return Demonstrations: Taylor's skill checklists with no
 * patient, which students demonstrate and you grade step by step on the
 * Patient Case scale. Grouped by the course each was made for.
 */
export default function ReturnDemosClient() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [assignTarget, setAssignTarget] = useState<ReturnDemoSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReturnDemoSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { data, loading, refresh } = usePageData("faculty:return-demos", async () => {
    const [demos, courses] = await Promise.all([fetchReturnDemos(), fetchMyCourses()]);
    return {
      demos: demos?.returnDemos ?? NO_DEMOS,
      enabled: demos?.enabled ?? true,
      failed: demos === null,
      offerings: courses.data?.offerings ?? [],
    };
  });
  const demos = data?.demos ?? NO_DEMOS;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return demos;
    return demos.filter(
      (d) => d.title.toLowerCase().includes(q) || d.skills.some((s) => skillLabel(s).toLowerCase().includes(q)),
    );
  }, [demos, search]);
  const groups = useMemo(() => groupByCourse(filtered, data?.offerings ?? []), [filtered, data?.offerings]);
  // Numbered over every one, not the filtered list, so a search doesn't renumber them.
  const numbers = useMemo(() => numberWithinCourse(demos), [demos]);

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    const result = await deleteReturnDemo(deleteTarget.id);
    setDeleting(false);
    if (result.error) {
      setDeleteError(result.error);
      return;
    }
    toast(`Deleted “${deleteTarget.title}”`);
    setDeleteTarget(null);
    void refresh();
  };

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faHandHoldingMedical} className="w-3.5 h-3.5" />,
          label: "Return Demonstrations",
        }}
        title="Return Demonstrations"
        subtitle="Taylor's skill checklists your students demonstrate, graded step by step"
      />

      {data && !data.enabled ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{RETURN_DEMOS_NEED_MIGRATION}</p>
        </div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-0 max-w-md flex-[1_1_16rem]">
              <FontAwesomeIcon icon={faSearch} className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                placeholder="Search by title or skill..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-xl border border-gray-400 bg-surface py-3 pl-10 pr-4 text-sm text-gray-900 shadow-sm transition-all placeholder:text-gray-500 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30"
              />
            </div>
            <div className="ml-auto flex flex-wrap justify-end gap-2">
              <button
                onClick={() => router.push("/faculty/return-demos/review")}
                className="flex items-center gap-2 whitespace-nowrap rounded-xl border border-brand-700/25 bg-surface px-4 py-2.5 text-sm font-semibold text-brand-800 transition-all hover:border-brand-700/40 hover:bg-brand-50"
              >
                <FontAwesomeIcon icon={faClipboardCheck} className="h-4 w-4 text-brand-600" />
                Grade
              </button>
              <button
                onClick={() => router.push("/faculty/return-demos/new")}
                className="flex items-center gap-2 whitespace-nowrap rounded-xl bg-gradient-to-r from-brand-600 to-brand-800 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_4px_14px_-2px_rgb(27_107_123_/_0.45)] transition-all hover:from-brand-700 hover:to-brand-900"
              >
                <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
                New Return Demonstration
              </button>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <SkeletonScenarioCard key={i} />
              ))}
            </div>
          ) : data?.failed ? (
            <p className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              Couldn&apos;t load your Return Demonstrations. Try again in a moment.
            </p>
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-hairline bg-surface p-12 text-center shadow-tile">
              <FontAwesomeIcon icon={faHandHoldingMedical} className="mx-auto mb-4 h-12 w-12 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-700">
                {search ? "No Return Demonstrations found" : "No Return Demonstrations yet"}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                {search
                  ? "Try a different title or skill."
                  : "Pick the Taylor's skills your students should demonstrate, then assign it to a group."}
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map((group) => (
                <section key={group.key} aria-label={group.code ? `${group.code} ${group.title}` : group.title}>
                  <CourseGroupHeading code={group.code} title={group.title} term={group.term} count={group.items.length} />
                  {group.items.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-center text-sm text-gray-500">
                      No Return Demonstrations for this course yet.
                    </p>
                  ) : (
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                      {group.items.map((demo) => (
                        <div
                          key={demo.id}
                          className="flex flex-col overflow-hidden rounded-xl border border-hairline bg-surface shadow-tile transition-all duration-200 hover:shadow-tile-hover"
                        >
                          <div className="flex-1 border-b border-hairline p-3">
                            {numbers.has(demo.id) && (
                              <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-indigo-700">
                                Return Demonstration #{numbers.get(demo.id)}
                              </p>
                            )}
                            <h3 className="line-clamp-2 font-semibold text-gray-900">{demo.title}</h3>
                            {demo.description && <p className="mt-1 line-clamp-2 text-sm text-gray-500">{demo.description}</p>}
                            <ul className="mt-3 flex flex-wrap gap-1.5">
                              {demo.skills.map((s, i) => (
                                <li
                                  key={`${s.id}-${i}`}
                                  className="max-w-full truncate rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700"
                                  title={s.title}
                                >
                                  {skillLabel(s)}
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="bg-subtle p-5">
                            <div className="mb-4 flex items-center justify-between text-sm">
                              <span className="flex items-center gap-1.5 text-gray-500">
                                <FontAwesomeIcon icon={faUsers} className="h-3.5 w-3.5" />
                                {demo.student_count} assigned · {demo.graded_count} graded
                              </span>
                              <span className="flex items-center gap-1.5 text-gray-400">
                                <FontAwesomeIcon icon={faCalendarDay} className="h-3.5 w-3.5" />
                                {new Date(demo.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <ActionsMenu
                              actions={[
                                { label: "Assign", icon: faUserPlus, onClick: () => setAssignTarget(demo) },
                                {
                                  label: "Grade",
                                  icon: faClipboardCheck,
                                  onClick: () => router.push(`/faculty/return-demos/review?scenario=${demo.id}`),
                                },
                                {
                                  label: "Edit",
                                  icon: faPenToSquare,
                                  onClick: () => router.push(`/faculty/return-demos/${demo.id}/edit`),
                                },
                                {
                                  label: "Delete",
                                  icon: faTrash,
                                  danger: true,
                                  onClick: () => {
                                    setDeleteError(null);
                                    setDeleteTarget(demo);
                                  },
                                },
                              ]}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {assignTarget && (
        <AssignModal
          demo={assignTarget}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => {
            setAssignTarget(null);
            void refresh();
          }}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          config={{
            title: "Delete Return Demonstration?",
            message: (
              <>
                <span className="font-medium text-gray-700">{deleteTarget.title}</span> will be permanently removed
                {deleteTarget.student_count > 0 ? ", along with the students' assignments" : ""}. This can&apos;t be undone.
              </>
            ),
            confirmLabel: "Delete",
            loading: deleting,
            error: deleteError,
            onConfirm: () => void confirmDelete(),
          }}
          onClose={() => !deleting && setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
