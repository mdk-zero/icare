"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faClipboardCheck,
  faFilePrescription,
  faHourglassHalf,
  faPlus,
  faSearch,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../components/PageHeader";
import StatTile from "../../components/StatTile";
import { SkeletonScenarioCard, SkeletonStatTile } from "../../components/skeletons";
import { usePageData } from "../../lib/use-page-data";
import {
  fetchCasePresentations,
  fetchMyCourses,
  type CasePresentationSummary,
} from "../../lib/api";
import { formatDue } from "./case-ui";
import { groupByCourse } from "../../lib/course-groups";
import CourseGroupHeading from "../../components/CourseGroupHeading";

const NO_PRESENTATIONS: CasePresentationSummary[] = [];

export default function FacultyCasesClient() {
  const { data, loading } = usePageData("faculty:cases", async () => {
    const [list, courses] = await Promise.all([fetchCasePresentations(), fetchMyCourses()]);
    return {
      presentations: list.data?.presentations ?? NO_PRESENTATIONS,
      error: list.error ?? null,
      offerings: courses.data?.offerings ?? [],
    };
  });
  const presentations = data?.presentations ?? NO_PRESENTATIONS;

  const [search, setSearch] = useState("");

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

  const toGrade = presentations.reduce((n, p) => n + p.counts.submitted, 0);
  const graded = presentations.reduce((n, p) => n + p.counts.graded, 0);
  const outstanding = presentations.reduce((n, p) => n + p.counts.not_started + p.counts.draft, 0);

  return (
    <div className="space-y-4">
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faFilePrescription} className="h-4 w-4" />, label: "Case Presentations" }}
        title="Case Presentations"
        subtitle="Students write up their most interesting patient from hospital duty — by initials only — and you grade the presentation"
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
            caption="Handed in, not yet graded"
            iconBg="bg-blue-50"
            iconColor="text-blue-600"
          />
          <StatTile
            icon={faHourglassHalf}
            value={outstanding}
            label="Still being written"
            caption="Not started or in draft"
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
            : "No case presentations yet. Create one to have your students write up a case from their hospital duty."}
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
          {group.items.map((p) => (
            <Link
              key={p.id}
              href={`/instructor/cases/${p.id}`}
              className="bg-surface rounded-xl border border-hairline shadow-tile overflow-hidden flex flex-col hover:border-brand-600/40 transition-colors"
            >
              <div className="p-4 flex-1 space-y-2">
                <h3 className="font-semibold text-gray-800">{p.title}</h3>
                <p className="text-sm text-gray-500">Due {formatDue(p.deadline)}</p>
                <div className="flex flex-wrap gap-1.5">
                  {(p.groups?.length ? p.groups.map((g) => ({ id: g.id, label: `${g.section_name} · ${g.name}` })) : p.sections.map((x) => ({ id: x.id, label: `Section ${x.name}` }))).map((c) => (
                    <span key={c.id} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                      {c.label}
                    </span>
                  ))}
                </div>
              </div>
              <div className="px-4 py-3 bg-subtle border-t border-hairline flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 tabular-nums">
                <span>{p.counts.total} students</span>
                <span className="text-blue-700">{p.counts.submitted} to grade</span>
                <span className="text-emerald-700">{p.counts.graded} graded</span>
                {p.counts.late > 0 && <span className="text-rose-700">{p.counts.late} late</span>}
              </div>
            </Link>
          ))}
        </div>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

