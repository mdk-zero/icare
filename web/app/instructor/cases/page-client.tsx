"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarDay,
  faClipboardCheck,
  faClock,
  faFilePrescription,
  faHourglassHalf,
  faListCheck,
  faPenToSquare,
  faPlus,
  faSearch,
  faTrash,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import ActionsMenu from "../../components/ActionsMenu";
import ConfirmModal from "../../components/ConfirmModal";
import PageHeader from "../../components/PageHeader";
import { toast } from "../../components/Toast";
import StatTile from "../../components/StatTile";
import { SkeletonScenarioCard, SkeletonStatTile } from "../../components/skeletons";
import { usePageData } from "../../lib/use-page-data";
import {
  deleteCasePresentation,
  fetchCasePresentations,
  fetchMyCourses,
  type CasePresentationSummary,
} from "../../lib/api";
import { formatDue } from "./case-ui";
import { groupByCourse } from "../../lib/course-groups";
import CourseGroupHeading from "../../components/CourseGroupHeading";

const NO_PRESENTATIONS: CasePresentationSummary[] = [];

export default function FacultyCasesClient() {
  const router = useRouter();
  const [toDelete, setToDelete] = useState<CasePresentationSummary | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { data, loading, refresh } = usePageData("faculty:cases", async () => {
    const [list, courses] = await Promise.all([fetchCasePresentations(), fetchMyCourses()]);
    return {
      presentations: list.data?.presentations ?? NO_PRESENTATIONS,
      error: list.error ?? null,
      offerings: courses.data?.offerings ?? [],
    };
  });
  const presentations = data?.presentations ?? NO_PRESENTATIONS;

  // ?q= opens the list already searched: a column link on a course's Progress tab.
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") ?? "");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return presentations;
    return presentations.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.sections.some((s) => s.name.toLowerCase().includes(q)) ||
        (p.groups ?? []).some((g) => `${g.section_name} ${g.name}`.toLowerCase().includes(q)),
    );
  }, [presentations, search]);

  // By the course each was made for, like Patient Cases and Quizzes.
  const groups = useMemo(() => groupByCourse(filtered, data?.offerings ?? []), [filtered, data?.offerings]);

  // "Case Presentation #2" within its course, oldest first, like Patient Case numbers.
  const caseNumber = useMemo(() => {
    const byCourse = new Map<string, CasePresentationSummary[]>();
    for (const p of presentations) {
      const key = p.offering_id ?? "";
      byCourse.set(key, [...(byCourse.get(key) ?? []), p]);
    }
    const numbers = new Map<string, number>();
    for (const list of byCourse.values()) {
      [...list]
        .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id))
        .forEach((p, i) => numbers.set(p.id, i + 1));
    }
    return numbers;
  }, [presentations]);

  const doDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    setDeleteError(null);
    const res = await deleteCasePresentation(toDelete.id);
    setDeleting(false);
    if (res.error !== undefined) return setDeleteError(res.error);
    toast("Case presentation deleted");
    setToDelete(null);
    refresh();
  };

  const toGrade = presentations.reduce((n, p) => n + p.counts.submitted, 0);
  const graded = presentations.reduce((n, p) => n + p.counts.graded, 0);
  const outstanding = presentations.reduce((n, p) => n + p.counts.not_started + p.counts.draft, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faFilePrescription} className="h-4 w-4" />, label: "Case Presentations" }}
        title="Case Presentations"
        subtitle="Groups report a patient case from hospital duty. Each leader uploads the slides, and you grade the group as a whole"
      />

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonStatTile key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatTile
            icon={faClipboardCheck}
            value={toGrade}
            label="Waiting for grading"
            caption="Groups that handed in, not yet graded"
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
          />
          <StatTile
            icon={faHourglassHalf}
            value={outstanding}
            label="Not handed in"
            caption="Groups still preparing their slides"
            iconBg="bg-amber-50"
            iconColor="text-amber-600"
          />
          <StatTile
            icon={faFilePrescription}
            value={graded}
            label="Graded"
            caption={`Across ${presentations.length} presentation${presentations.length === 1 ? "" : "s"}`}
            iconBg="bg-emerald-50"
            iconColor="text-emerald-600"
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1">
          <FontAwesomeIcon icon={faSearch} className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by title, section or group..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-surface border border-gray-400 rounded-xl text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-brand-600/30 focus:border-brand-600 transition-all"
          />
        </div>
        <Link
          href="/instructor/cases/new"
          className="flex items-center gap-2 px-5 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition-colors text-sm font-medium shadow-[0_2px_6px_rgba(27,107,123,0.2)] shrink-0"
        >
          <FontAwesomeIcon icon={faPlus} className="w-3.5 h-3.5" />
          New Case Presentation
        </Link>
      </div>

      {data?.error && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">{data.error}</p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonScenarioCard key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-surface p-12 rounded-xl border border-hairline shadow-tile text-center text-gray-500">
          {search
            ? "No case presentations match your search."
            : "No case presentations yet. Create one to have your groups report a case from their hospital duty."}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.key} aria-label={group.code ? `${group.code} ${group.title}` : group.title}>
              <CourseGroupHeading code={group.code} title={group.title} term={group.term} count={group.items.length} />
              {group.items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-gray-300 px-4 py-5 text-center text-sm text-gray-500">
                  No case presentations for this course yet.
                </p>
              ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {group.items.map((p) => {
            const handedIn = p.counts.submitted + p.counts.graded;
            const audience = p.groups?.length
              ? p.groups.map((g) => ({ id: g.id, label: `${g.section_name} · ${g.name}` }))
              : p.sections.map((x) => ({ id: x.id, label: `Section ${x.name}` }));
            return (
              <div
                key={p.id}
                className="group bg-surface rounded-xl border border-hairline shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_1px_2px_-1px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_12px_0_rgba(0,0,0,0.06),0_2px_4px_-2px_rgba(0,0,0,0.06)] hover:border-gray-200 transition-all duration-200 overflow-hidden flex flex-col"
              >
                <div className="p-3 border-b border-hairline flex-1">
                  <div className="mb-3 min-w-0">
                    {caseNumber.has(p.id) && (
                      <p className="mb-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-700">
                        Case Presentation #{caseNumber.get(p.id)}
                      </p>
                    )}
                    <h3 className="font-semibold text-gray-900 line-clamp-2">{p.title}</h3>
                  </div>
                  {p.instructions && <p className="text-sm text-gray-500 line-clamp-2 mb-4">{p.instructions}</p>}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-medium rounded-full flex items-center gap-1">
                      <FontAwesomeIcon icon={faCalendarDay} className="w-3 h-3" />
                      Due {formatDue(p.deadline)}
                    </span>
                    {audience.map((c) => (
                      <span
                        key={c.id}
                        className="px-2.5 py-1 bg-teal-50 text-teal-700 text-xs font-medium rounded-full flex items-center gap-1"
                      >
                        <FontAwesomeIcon icon={faUsers} className="w-3 h-3" />
                        {c.label}
                      </span>
                    ))}
                    {p.counts.late > 0 && (
                      <span className="px-2.5 py-1 bg-rose-50 text-rose-700 text-xs font-medium rounded-full">
                        {p.counts.late} late
                      </span>
                    )}
                  </div>
                </div>
                <div className="p-5 bg-subtle">
                  <div className="flex items-center justify-between gap-3 text-sm mb-4">
                    <span className="text-gray-500 flex shrink-0 items-center gap-1.5">
                      <FontAwesomeIcon icon={faUsers} className="w-3.5 h-3.5" />
                      {p.counts.total} group{p.counts.total === 1 ? "" : "s"}
                      {p.student_count ? ` · ${p.student_count} students` : ""}
                      {p.counts.graded > 0 && <span className="text-emerald-700">· {p.counts.graded} graded</span>}
                    </span>
                    <span
                      className="text-gray-400 flex min-w-0 items-center gap-1.5 text-xs"
                      title={new Date(p.created_at).toLocaleString("en-US", { dateStyle: "full", timeStyle: "short" })}
                    >
                      <FontAwesomeIcon icon={faClock} className="w-3 h-3 shrink-0" />
                      <span className="truncate">
                        Created{" "}
                        {new Date(p.created_at).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </span>
                    </span>
                  </div>
                  {p.counts.total > 0 && (
                    <button
                      type="button"
                      onClick={() => router.push(`/instructor/cases/${p.id}`)}
                      className={`mb-2 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
                        p.counts.submitted > 0
                          ? "bg-brand-600 text-white hover:bg-brand-700"
                          : "border border-brand-600/40 bg-surface text-brand-700 hover:bg-brand-600/5"
                      }`}
                    >
                      <FontAwesomeIcon icon={faListCheck} className="h-3.5 w-3.5" />
                      {p.counts.submitted > 0 ? (
                        <>
                          Review
                          <span className="rounded-full bg-white/20 px-2 py-0.5 text-xs tabular-nums">
                            {p.counts.submitted} to grade
                          </span>
                        </>
                      ) : (
                        "Review grades"
                      )}
                    </button>
                  )}
                  <ActionsMenu
                    actions={[
                      {
                        label: "Edit",
                        icon: faPenToSquare,
                        onClick: () => router.push(`/instructor/cases/${p.id}?edit=1`),
                      },
                      {
                        label: "Delete",
                        icon: faTrash,
                        danger: true,
                        onClick: () => {
                          setDeleteError(null);
                          setToDelete(p);
                        },
                        // Handed-in work stays, as on its own page.
                        disabled: handedIn > 0,
                        disabledReason: `You can't delete this case presentation because ${handedIn} group${handedIn === 1 ? " has" : "s have"} handed it in.`,
                      },
                    ]}
                  />
                </div>
              </div>
            );
          })}
        </div>
              )}
            </section>
          ))}
        </div>
      )}

      {toDelete && (
        <ConfirmModal
          config={{
            title: "Delete case presentation",
            message: (
              <>
                <span className="font-medium text-gray-700">{toDelete.title}</span> will be removed from every group. This
                can&apos;t be undone.
              </>
            ),
            loading: deleting,
            error: deleteError,
            onConfirm: doDelete,
          }}
          onClose={() => {
            if (!deleting) setToDelete(null);
          }}
        />
      )}
    </div>
  );
}

