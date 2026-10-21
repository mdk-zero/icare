"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faPeopleGroup,
  faArrowLeft,
  faChevronRight,
  faSearch,
  faBrain,
  faLayerGroup,
  faUsers,
  faCircleCheck,
  faTriangleExclamation,
  faUserPlus,
  faFolderOpen,
  faBookOpen,
} from "@fortawesome/free-solid-svg-icons";
import {
  runFacultyMlJob,
  fetchFacultyStudents,
  fetchFacultyTeams,
  fetchMyCourses,
  moveStudentToTeam,
  type FacultyStudent,
  type TeamsOverview,
} from "../../lib/api";
import PageHeader from "../../components/PageHeader";
import StatTile from "../../components/StatTile";
import FilterSelect from "../../components/FilterSelect";
import Avatar from "../../components/Avatar";
import { EcgLoader } from "../../components/EcgLoader";
import { SkeletonSectionGrid } from "../../components/skeletons";
import MlRunProgress, { mlRunFraction, mlRunLabel, type MlRun } from "../../components/MlRunProgress";
import { loadingToast, toast } from "../../components/Toast";
import { usePageData } from "../../lib/use-page-data";
import { termStatus } from "../../lib/course-progress";
import SectionGroups from "../../admin/student-management/SectionGroups";
import RegisterStudentModal from "../../components/enroll/RegisterStudentModal";
import BulkEnrollModal from "../../components/enroll/BulkEnrollModal";
import { AppLinkCard } from "../../components/AppLink";
import { isStudentDrag, leftTarget, readStudentDrag, startStudentDrag } from "../../admin/student-management/drag";

/** Long enough to read a sentence with numbers in it. */
const ML_TOAST_MS = 8000;


const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, undefined, { numeric: true });

type Member = TeamsOverview["students"][number];

function formatLastActive(value: string | null | undefined): string {
  if (!value) return "Never";
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** A card that opens the next level: a course, or a section in it. */
function DrillCard({
  icon,
  title,
  subtitle,
  atRisk,
  total,
  action,
  onOpen,
}: {
  icon: typeof faLayerGroup;
  title: string;
  subtitle: string;
  atRisk: number;
  total: number;
  action: string;
  onOpen: () => void;
}) {
  return (
    <div className="group relative rounded-xl border border-hairline bg-surface p-5 shadow-tile transition-all duration-200 focus-within:border-brand-300 hover:border-brand-300 hover:shadow-tile-hover">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-600/10 text-brand-600">
          <FontAwesomeIcon icon={icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-900">{title}</p>
          <p className="truncate text-xs text-gray-500">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-hairline pt-4">
        {total === 0 ? (
          <span className="text-xs text-gray-400">No students yet</span>
        ) : atRisk > 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 text-xs font-medium text-rose-700">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-3 w-3" />
            {atRisk} at risk
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-700">
            <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
            All safe
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-400 transition-colors group-hover:text-brand-600">
          {action}
          <FontAwesomeIcon icon={faChevronRight} className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
      <button
        onClick={onOpen}
        aria-label={`${action}: ${title}`}
        className="absolute inset-0 rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40"
      />
    </div>
  );
}

/**
 * The instructor's students, as the dean manages them but within their own
 * courses: pick a course, then one of its sections, then group, enroll and
 * place that section's students. An instructor builds and supervises their
 * own groups; students in another instructor's group aren't shown.
 */
export default function TeamsClient() {
  const router = useRouter();
  const { data: courses, loading: loadingCourses } = usePageData("faculty:students:courses", fetchMyCourses);
  const { data: overview, loading: loadingTeams, refresh: refreshTeams } = usePageData("faculty:teams", fetchFacultyTeams);
  const { data: roster, refresh: refreshRoster } = usePageData("faculty:students", () => fetchFacultyStudents());

  const [courseId, setCourseId] = useState<string | null>(null);
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [registering, setRegistering] = useState(false);
  const [bulkEnrolling, setBulkEnrolling] = useState(false);
  const [tableDropActive, setTableDropActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [anchorId, setAnchorId] = useState<string | null>(null);
  const [mlRun, setMlRun] = useState<MlRun | null>(null);
  const runningMl = mlRun !== null;
  const q = query.trim().toLowerCase();

  const offerings = useMemo(
    () =>
      [...(courses?.data?.offerings ?? [])].sort(
        (a, b) => Number(termStatus(a.term) === "ended") - Number(termStatus(b.term) === "ended") || a.course.code.localeCompare(b.course.code),
      ),
    [courses],
  );
  const details = useMemo(() => new Map<string, FacultyStudent>((roster ?? []).map((s) => [s.id, s])), [roster]);

  // Moves shown at once, before the server confirms them (as on the dean's page).
  const [pendingMoves, setPendingMoves] = useState<Map<string, string | null>>(new Map());
  const shownOverview = useMemo<TeamsOverview | null>(() => {
    if (!overview || pendingMoves.size === 0) return overview ?? null;
    const people = new Map<string, TeamsOverview["teams"][number]["members"][number]>();
    for (const s of overview.students) people.set(s.id, { id: s.id, name: s.name, picture_url: s.picture_url, sex: s.sex });
    for (const t of overview.teams) for (const m of t.members) people.set(m.id, m);
    const incoming = (teamId: string) =>
      [...pendingMoves]
        .filter(([, to]) => to === teamId)
        .map(([id]) => people.get(id))
        .filter((m): m is NonNullable<typeof m> => !!m);
    return {
      ...overview,
      teams: overview.teams.map((t) => ({
        ...t,
        members: [...t.members.filter((m) => !pendingMoves.has(m.id)), ...incoming(t.id)],
      })),
      students: overview.students.map((s) => (pendingMoves.has(s.id) ? { ...s, team_id: pendingMoves.get(s.id) ?? null } : s)),
    };
  }, [overview, pendingMoves]);

  const moveStudents = async (ids: string[], to: string | null, labels: { pending: string; done: string }) => {
    setPendingMoves((prev) => {
      const next = new Map(prev);
      for (const id of ids) next.set(id, to);
      return next;
    });
    setSelectedIds((prev) => new Set([...prev].filter((id) => !ids.includes(id))));
    const progress = loadingToast(labels.pending);
    let failure: string | null = null;
    for (const id of ids) {
      const result = await moveStudentToTeam(id, to);
      if ("error" in result) failure = result.error;
    }
    await refreshTeams();
    setPendingMoves((prev) => {
      const next = new Map(prev);
      for (const id of ids) if (next.get(id) === to) next.delete(id);
      return next;
    });
    if (failure) progress.error(failure);
    else progress.success(labels.done);
  };

  const studentsOf = (ids: string[]): Member[] =>
    (shownOverview?.students ?? []).filter((s) => ids.includes(s.section_id));
  const isAtRisk = (id: string) => details.get(id)?.risk_level === "at_risk";
  const matchesFilter = (id: string) => {
    const risk = details.get(id)?.risk_level;
    return filterStatus === "all" || (filterStatus === "at-risk" && risk === "at_risk") || (filterStatus === "safe" && risk === "safe");
  };

  const course = offerings.find((o) => o.id === courseId) ?? null;
  const section = course?.sections.find((s) => s.id === sectionId) ?? null;
  const sectionStudents = section
    ? (shownOverview?.students ?? []).filter((s) => s.section_id === section.id).sort(byName)
    : [];
  const sectionGroups = section
    ? (shownOverview?.teams ?? []).filter((t) => t.section_id === section.id).sort(byName)
    : [];
  const hasGroups = sectionGroups.length > 0;
  // New students go into one of the instructor's own groups here (the
  // students API needs one), so they land on their roster.
  const enrollGroups = sectionGroups.map((t) => ({ id: t.id, name: t.name, size: t.members.length }));
  const enrollBlocked = enrollGroups.length === 0 ? "Make a group in this section first; new students join one of your groups." : undefined;
  // The section's students in no group, as searched and filtered.
  const tableStudents = sectionStudents.filter(
    (s) =>
      !s.team_id &&
      matchesFilter(s.id) &&
      (!q || s.name.toLowerCase().includes(q) || (details.get(s.id)?.email ?? "").toLowerCase().includes(q)),
  );

  const openCourse = (id: string | null) => {
    setCourseId(id);
    setSectionId(null);
    setSelectedIds(new Set());
    setQuery("");
  };
  const openSection = (id: string | null) => {
    setSectionId(id);
    setSelectedIds(new Set());
    setQuery("");
  };

  // Word-style picking: click one, Ctrl/Cmd+click to add, Shift+click for a run; Esc clears.
  const selectRow = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && anchorId) {
      const ids = tableStudents.map((s) => s.id);
      const [from, to] = [ids.indexOf(anchorId), ids.indexOf(id)].sort((x, y) => x - y);
      if (from >= 0) {
        setSelectedIds(new Set(ids.slice(from, to + 1)));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey || selectedIds.has(id)) {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        if (!next.delete(id)) next.add(id);
        return next;
      });
    } else {
      setSelectedIds(new Set([id]));
    }
    setAnchorId(id);
  };
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelectedIds(new Set());
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selectedIds]);
  const selectedStudents = tableStudents.filter((s) => selectedIds.has(s.id));
  const allVisibleSelected = tableStudents.length > 0 && selectedStudents.length === tableStudents.length;
  const toggleStudent = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const toggleAllVisible = () =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const s of tableStudents) {
        if (allVisibleSelected) next.delete(s.id);
        else next.add(s.id);
      }
      return next;
    });

  const handleRunMl = async () => {
    setMlRun({ job: "predict", fraction: 0 });
    const predictions = await runFacultyMlJob("predict", (fraction) => setMlRun({ job: "predict", fraction }));
    if (predictions.error) {
      toast(predictions.error, "error", ML_TOAST_MS);
      setMlRun(null);
      return;
    }
    setMlRun({ job: "recommend", fraction: 0 });
    const recommendations = await runFacultyMlJob("recommend", (fraction) => setMlRun({ job: "recommend", fraction }));
    if (recommendations.error) {
      toast(recommendations.error, "error", ML_TOAST_MS);
      setMlRun(null);
      return;
    }
    const scored = Number(predictions.result?.scored ?? 0);
    const atRisk = Number(predictions.result?.at_risk ?? 0);
    const recs = Number(recommendations.result?.recommendations ?? 0);
    toast(`Scored ${scored} of your students (${atRisk} low performing) and wrote ${plural(recs, "recommendation")}.`, "success", ML_TOAST_MS);
    setMlRun(null);
    await refreshRoster();
  };

  const allStudents = shownOverview?.students ?? [];
  const loading = (loadingCourses && !courses) || (loadingTeams && !overview);

  // The app link goes to the students in view, at whichever level is open,
  // as far as the roster (the server's own scope) has them.
  const linkStudents = (section ? sectionStudents : course ? studentsOf(course.sections.map((s) => s.id)) : allStudents)
    .filter((s) => details.has(s.id))
    .map((s) => ({ id: s.id, name: s.name, signedIn: Boolean(details.get(s.id)?.last_login_at) }));
  const linkScope = section ? `in ${section.name}` : course ? `in ${course.course.code}` : "on your roster";

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faPeopleGroup} className="h-3.5 w-3.5" />, label: "Teaching" }}
        title="Students"
        subtitle="Enroll and group the students in your courses, section by section."
        action={{
          icon: runningMl ? <EcgLoader /> : <FontAwesomeIcon icon={faBrain} className="h-4 w-4" />,
          onClick: handleRunMl,
          text: mlRun ? `${Math.round(mlRunFraction(mlRun) * 100)}%` : "Assess",
          disabled: runningMl || allStudents.length === 0,
          label: mlRun
            ? mlRunLabel(mlRun)
            : "Run ML Jobs — score your students for risk and refresh their quiz recommendations",
          below: mlRun && <MlRunProgress run={mlRun} />,
        }}
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile icon={faUsers} value={allStudents.length} label="Total Students" caption={plural(offerings.length, "course")} />
        <StatTile
          icon={faCircleCheck}
          value={allStudents.filter((s) => details.get(s.id)?.risk_level === "safe").length}
          label="Safe"
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
        <StatTile
          icon={faTriangleExclamation}
          value={allStudents.filter((s) => isAtRisk(s.id)).length}
          label="Low Performing"
          iconBg="bg-rose-50"
          iconColor="text-rose-600"
        />
        <StatTile
          icon={faLayerGroup}
          value={allStudents.filter((s) => !s.team_id).length}
          label="Not in a group"
          caption="Yours to place"
          iconBg="bg-gray-100"
          iconColor="text-gray-600"
        />
      </div>

      <AppLinkCard students={linkStudents} scope={linkScope} />

      <div className="mb-4 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <FontAwesomeIcon icon={faSearch} className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder={section ? `Search students in ${section.name}…` : course ? "Search sections…" : "Search courses…"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-xl border border-gray-200 bg-surface py-2.5 pl-11 pr-4 text-gray-700 transition-all placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/40"
          />
        </div>
        {section && (
          <FilterSelect value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">All Students</option>
            <option value="at-risk">Low Performing</option>
            <option value="safe">Safe</option>
          </FilterSelect>
        )}
      </div>

      {loading ? (
        <SkeletonSectionGrid />
      ) : !course ? (
        // 1. Courses
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {offerings
            .filter((o) => !q || `${o.course.code} ${o.course.title}`.toLowerCase().includes(q))
            .map((o) => {
              const people = studentsOf(o.sections.map((s) => s.id));
              return (
                <DrillCard
                  key={o.id}
                  icon={faBookOpen}
                  title={`${o.course.code} · ${o.course.title}`}
                  subtitle={`${o.term.name}${termStatus(o.term) === "ended" ? " (ended)" : ""} · ${plural(o.sections.length, "section")} · ${plural(people.length, "student")}`}
                  atRisk={people.filter((s) => isAtRisk(s.id)).length}
                  total={people.length}
                  action="View sections"
                  onOpen={() => openCourse(o.id)}
                />
              );
            })}
          {offerings.length === 0 && (
            <div className="col-span-full rounded-xl border border-dashed border-gray-300 bg-surface p-12 text-center">
              <FontAwesomeIcon icon={faBookOpen} className="h-8 w-8 text-gray-300" />
              <p className="mt-3 font-semibold text-gray-700">No courses yet</p>
              <p className="mt-1 text-sm text-gray-500">When your dean assigns you a course, its sections show up here.</p>
            </div>
          )}
        </div>
      ) : !section ? (
        // 2. The course's sections
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => openCourse(null)}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
            >
              <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
              All courses
            </button>
            <h2 className="font-display truncate text-lg font-bold text-gray-900">
              {course.course.code} <span className="font-normal text-gray-500">{course.course.title}</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {course.sections
              .filter((s) => !q || s.name.toLowerCase().includes(q))
              .sort(byName)
              .map((s) => {
                const people = studentsOf([s.id]);
                const groups = (shownOverview?.teams ?? []).filter((t) => t.section_id === s.id).length;
                return (
                  <DrillCard
                    key={s.id}
                    icon={faLayerGroup}
                    title={s.name}
                    subtitle={`${plural(people.length, "student")}${groups ? ` · ${plural(groups, "group")}` : ""}`}
                    atRisk={people.filter((p) => isAtRisk(p.id)).length}
                    total={people.length}
                    action="View roster"
                    onOpen={() => openSection(s.id)}
                  />
                );
              })}
            {course.sections.length === 0 && (
              <p className="col-span-full rounded-xl border border-dashed border-gray-300 bg-surface p-10 text-center text-sm text-gray-500">
                This course has no sections yet. Your dean adds them.
              </p>
            )}
          </div>
        </>
      ) : (
        // 3. One section: its groups, then who is in none
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button
              onClick={() => openSection(null)}
              className="flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
            >
              <FontAwesomeIcon icon={faArrowLeft} className="h-3.5 w-3.5" />
              {course.course.code} sections
            </button>
            <h2 className="font-display truncate text-lg font-bold text-gray-900">{section.name}</h2>
            <span className="rounded-full border border-brand-600/20 bg-brand-600/10 px-2.5 py-1 text-xs font-medium text-brand-700">
              {plural(sectionStudents.length, "student")}
            </span>
          </div>

          <SectionGroups
            sectionId={section.id}
            studentCount={sectionStudents.length}
            overview={shownOverview}
            onChanged={refreshTeams}
            pendingIds={pendingMoves}
            onMove={moveStudents}
            canAssignInstructor={false}
          />

          <div className="mb-2 mt-2 flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-display text-base font-semibold text-gray-900">
              {hasGroups ? "Not in a group" : "Students"}{" "}
              <span className="text-sm font-normal text-gray-400">({tableStudents.length})</span>
            </h3>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setBulkEnrolling(true)}
                disabled={!!enrollBlocked}
                title={enrollBlocked}
                className="disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-4 py-2 text-sm font-medium text-gray-700 transition-all hover:border-brand-300 hover:text-brand-700"
              >
                <FontAwesomeIcon icon={faUsers} className="h-3.5 w-3.5" />
                Bulk enroll
              </button>
              <button
                onClick={() => setRegistering(true)}
                disabled={!!enrollBlocked}
                title={enrollBlocked}
                className="disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-all hover:bg-brand-700"
              >
                <FontAwesomeIcon icon={faUserPlus} className="h-3.5 w-3.5" />
                Register student
              </button>
            </div>
          </div>

          {selectedStudents.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-brand-600/20 bg-brand-600/5 px-4 py-3">
              <p className="text-sm font-medium text-gray-700">{plural(selectedStudents.length, "student")} selected</p>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="text-sm font-medium text-gray-500 transition-colors hover:text-gray-800"
              >
                Clear
              </button>
              {hasGroups && <p className="text-sm text-gray-500">Drag any of them onto a group to add them all.</p>}
            </div>
          )}

          <div
            onDragOver={(e) => {
              if (!hasGroups || !isStudentDrag(e)) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setTableDropActive(true);
            }}
            onDragLeave={(e) => {
              if (leftTarget(e)) setTableDropActive(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setTableDropActive(false);
              const drag = readStudentDrag(e);
              if (!drag?.fromGroupId) return;
              void moveStudents(drag.studentIds, null, {
                pending: `Taking ${drag.label} out of their group…`,
                done: `${drag.label} ${drag.studentIds.length === 1 ? "is" : "are"} no longer in a group`,
              });
            }}
            className={`relative overflow-hidden rounded-xl border bg-surface shadow-tile transition-all duration-150 ${
              tableDropActive ? "border-brand-500 ring-2 ring-brand-500/40" : "border-hairline"
            }`}
          >
            {tableDropActive && (
              <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-brand-50/85">
                <span className="rounded-full bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white shadow-sm">
                  Drop to take them out of their group
                </span>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-gray-100 bg-subtle">
                  <tr>
                    <th className="w-12 px-4 py-3 sm:pl-6 sm:pr-0">
                      <input
                        type="checkbox"
                        checked={allVisibleSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = selectedStudents.length > 0 && !allVisibleSelected;
                        }}
                        onChange={toggleAllVisible}
                        disabled={tableStudents.length === 0}
                        aria-label={`Select all students in ${section.name}`}
                        className="h-4 w-4 cursor-pointer accent-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </th>
                    {(hasGroups ? ["Name", "Enrolled"] : ["Student", "Status", "Last Active"]).map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:px-6"
                      >
                        {h}
                      </th>
                    ))}
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:px-6">
                      View details
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {tableStudents.map((student) => {
                    const info = details.get(student.id);
                    const risk = info?.risk_level ?? null;
                    return (
                      <tr
                        key={student.id}
                        draggable={hasGroups}
                        onDragStart={(e) => {
                          const carried = selectedIds.has(student.id)
                            ? tableStudents.filter((s) => selectedIds.has(s.id))
                            : [student];
                          startStudentDrag(e, carried, null);
                        }}
                        title={
                          hasGroups
                            ? "Click to select, Ctrl+click to add more, Shift+click for a range, then drag onto a group"
                            : "Click to select, Ctrl+click to add more, Shift+click for a range"
                        }
                        onClick={(e) => selectRow(student.id, e)}
                        className={`select-none transition-colors ${hasGroups ? "cursor-grab-outlined" : "cursor-default"} ${
                          pendingMoves.has(student.id)
                            ? "pointer-events-none animate-pulse opacity-50 grayscale"
                            : selectedIds.has(student.id)
                              ? "bg-brand-600/10 shadow-[inset_3px_0_0_0_var(--color-brand-600)]"
                              : "hover:bg-subtle"
                        }`}
                      >
                        <td className="px-4 py-4 sm:pl-6 sm:pr-0" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selectedIds.has(student.id)}
                            onChange={() => toggleStudent(student.id)}
                            aria-label={`Select ${student.name}`}
                            className="h-4 w-4 cursor-pointer accent-brand-600"
                          />
                        </td>
                        <td className="px-4 py-4 sm:px-6">
                          <div className="flex items-center gap-3">
                            <Avatar
                              name={student.name}
                              src={student.picture_url}
                              userId={student.id}
                              sex={student.sex}
                              size="md"
                              tone={risk === "at_risk" ? "risk" : "brand"}
                            />
                            <div className="min-w-0">
                              <p className="truncate font-semibold text-gray-800">{student.name}</p>
                              <p className="truncate text-sm text-gray-500">{info?.email ?? ""}</p>
                            </div>
                          </div>
                        </td>
                        {hasGroups ? (
                          <td className="px-4 py-4 text-sm text-gray-500 sm:px-6">
                            {info?.created_at
                              ? new Date(info.created_at).toLocaleString("en-US", {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "numeric",
                                  minute: "2-digit",
                                })
                              : "—"}
                          </td>
                        ) : (
                          <>
                            <td className="px-4 py-4 sm:px-6">
                              <span
                                className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                                  !risk
                                    ? "bg-gray-100 text-gray-500"
                                    : risk === "at_risk"
                                      ? "bg-rose-50 text-rose-600"
                                      : "bg-emerald-50 text-emerald-600"
                                }`}
                              >
                                {!risk ? "Not scored yet" : risk === "at_risk" ? "Low Performing" : "Safe"}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-500 sm:px-6">{formatLastActive(info?.last_activity)}</td>
                          </>
                        )}
                        <td className="px-4 py-4 sm:px-6" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => router.push(`/faculty/students/${student.id}`)}
                            aria-label={`View ${student.name}'s profile`}
                            title="View profile"
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-brand-600/10 hover:text-brand-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600/40"
                          >
                            <FontAwesomeIcon icon={faFolderOpen} className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {tableStudents.length === 0 && (
                    <tr>
                      <td colSpan={hasGroups ? 4 : 5} className="py-12 text-center text-gray-400">
                        {q || filterStatus !== "all"
                          ? "No students match"
                          : hasGroups
                            ? "Every student is in a group"
                            : "No students in this section yet"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {bulkEnrolling && section && (
        <BulkEnrollModal
          sectionId={section.id}
          sectionName={section.name}
          groups={enrollGroups}
          asInstructor
          onClose={() => setBulkEnrolling(false)}
          onFinished={(created) => {
            if (created > 0) void refreshRoster();
            void refreshTeams();
          }}
        />
      )}
      {registering && section && (
        <RegisterStudentModal
          sectionId={section.id}
          sectionName={section.name}
          groups={enrollGroups}
          asInstructor
          onClose={() => setRegistering(false)}
          onRegistered={() => {
            void refreshRoster();
            void refreshTeams();
          }}
        />
      )}
    </div>
  );
}
