"use client";

import { Fragment, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faChevronLeft,
  faClipboardCheck,
  faClipboardList,
  faMagnifyingGlass,
  faUserGraduate,
} from "@fortawesome/free-solid-svg-icons";
import { ScenarioAssignment, fetchScenarioAssignments } from "../../../lib/api";
import AssignmentGrader from "./assignment-grader";
import AssignmentList, { EmptyPanel, isSubmitted } from "./assignment-list";
import Avatar from "../../../components/Avatar";
import PageHeader from "../../../components/PageHeader";
import { usePageData } from "../../../lib/use-page-data";

// Stable empty fallback, so the filter memos are not invalidated every render.
const NO_ASSIGNMENTS: ScenarioAssignment[] = [];

/** Team names in natural order ("Team 2" before "Team 10"), students without a team last. */
const compareTeams = (a: string | null, b: string | null) =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : a.localeCompare(b, undefined, { numeric: true });

/** The group filter: every group, one group by name, or students in none. */
const ALL_GROUPS = "__all";
const NO_GROUP = "__none";

/** Stand-ins shaped like the student rows: an avatar beside a name and a count. */
function StudentRowSkeleton() {
  return (
    <div className="flex animate-pulse items-center gap-3 rounded-xl border border-hairline bg-surface p-3 shadow-tile">
      <div className="h-10 w-10 shrink-0 rounded-full bg-gray-200" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-2/3 rounded bg-gray-200" />
        <div className="h-2.5 w-1/3 rounded bg-gray-100" />
      </div>
    </div>
  );
}

export default function FacultyScenarioReviewClient() {
  const router = useRouter();

  const [studentQuery, setStudentQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>(ALL_GROUPS);
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Whether the open sheet has ratings or notes not saved yet (the grader reports it).
  const [dirty, setDirty] = useState(false);

  const gradingRef = useRef<HTMLElement>(null);

  const { data: assignmentsData, loading, setData: setAssignmentsData } = usePageData(
    "faculty:scenario-review",
    fetchScenarioAssignments,
  );
  const assignments = assignmentsData ?? NO_ASSIGNMENTS;

  /** One row per student, so the queue can be searched/picked before any
   * submissions are shown — grouping happens client-side since the API
   * still returns a flat list of assignments. */
  const studentGroups = useMemo(() => {
    const byStudent = new Map<
      string,
      Pick<ScenarioAssignment, "student_id" | "student_name" | "student_picture_url" | "student_sex" | "team_id" | "team_name"> & {
        assignments: ScenarioAssignment[];
      }
    >();
    for (const a of assignments) {
      const entry = byStudent.get(a.student_id);
      if (entry) entry.assignments.push(a);
      else
        byStudent.set(a.student_id, {
          student_id: a.student_id,
          student_name: a.student_name,
          student_picture_url: a.student_picture_url,
          student_sex: a.student_sex,
          team_id: a.team_id ?? null,
          // The section-qualified label, since group names repeat across sections.
          team_name: a.team_label ?? a.team_name ?? null,
          assignments: [a],
        });
    }
    return Array.from(byStudent.values())
      .map((g) => ({
        ...g,
        awaiting: g.assignments.filter(isSubmitted).length,
        completed: g.assignments.filter((a) => a.status === "completed").length,
      }))
      // Grouped by team (students without one last), then who needs review first.
      .sort(
        (a, b) =>
          compareTeams(a.team_name ?? null, b.team_name ?? null) ||
          b.awaiting - a.awaiting ||
          a.student_name.localeCompare(b.student_name),
      );
  }, [assignments]);
  const hasTeams = studentGroups.some((g) => g.team_name);
  // One chip per group id (names repeat across sections), in label order.
  const groupOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const g of studentGroups) if (g.team_id) byId.set(g.team_id, g.team_name ?? "Group");
    return [...byId].map(([key, label]) => ({ key, label })).sort((a, b) => compareTeams(a.label, b.label));
  }, [studentGroups]);
  const hasUngrouped = studentGroups.some((g) => !g.team_name);

  const filteredStudentGroups = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    return studentGroups.filter(
      (g) =>
        (groupFilter === ALL_GROUPS ||
          (groupFilter === NO_GROUP ? !g.team_id : g.team_id === groupFilter)) &&
        (!q || g.student_name.toLowerCase().includes(q) || (g.team_name ?? "").toLowerCase().includes(q)),
    );
  }, [studentGroups, studentQuery, groupFilter]);

  const selectedStudent = studentGroups.find((g) => g.student_id === selectedStudentId) ?? null;

  /** Averages over one group's individual grades, when a group chip is picked. */
  const selectedGroupStats = useMemo(() => {
    if (groupFilter === ALL_GROUPS || groupFilter === NO_GROUP) return null;
    const work = studentGroups.filter((g) => g.team_id === groupFilter).flatMap((g) => g.assignments);
    const graded = work.filter((a) => a.status === "completed" && typeof a.score === "number");
    return {
      assigned: work.length,
      graded: graded.length,
      average: graded.length
        ? Math.round(graded.reduce((sum, a) => sum + (a.score ?? 0), 0) / graded.length)
        : null,
      cases: new Set(work.map((a) => a.scenario_id)).size,
    };
  }, [studentGroups, groupFilter]);

  const confirmDiscard = () => !dirty || window.confirm("Discard your unsaved ratings and notes?");

  const selectStudent = (studentId: string) => {
    if (!confirmDiscard()) return;
    setSelectedStudentId(studentId);
    setSelectedId(null);
  };

  const backToStudents = () => {
    if (!confirmDiscard()) return;
    setSelectedStudentId(null);
    setSelectedId(null);
  };

  const selectAssignment = (id: string) => {
    if (id === selectedId || !confirmDiscard()) return;
    setSelectedId(id);
    // Stacked below the queue on narrow screens, the rubric would open out of sight.
    if (!window.matchMedia("(min-width: 1024px)").matches) {
      requestAnimationFrame(() => gradingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }
  };

  const studentAssignments = useMemo(
    () => assignments.filter((a) => a.student_id === selectedStudentId),
    [assignments, selectedStudentId],
  );
  const selected = assignments.find((a) => a.id === selectedId) ?? null;

  const updateAssignment = (id: string, patch: Partial<ScenarioAssignment>) =>
    setAssignmentsData((previous) => (previous ?? NO_ASSIGNMENTS).map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const submittedCount = assignments.filter(isSubmitted).length;

  return (
    <div>
      <PageHeader
        badge={{
          icon: <FontAwesomeIcon icon={faClipboardCheck} className="h-3.5 w-3.5" />,
          label: "Scenario Management",
        }}
        title="Review Submissions"
        subtitle="Rate each criterion of a student's scenario on a verbal scale, add notes where it helps, then save the grade — you can edit it later."
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button
          onClick={() => confirmDiscard() && router.push("/faculty/scenarios")}
          className="flex items-center gap-2 rounded-lg border border-gray-200 bg-surface px-3 py-2 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50"
        >
          <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5" />
          Back to scenarios
        </button>
        {submittedCount > 0 && (
          <span className="ml-auto flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1.5 text-sm font-semibold tabular-nums text-brand-700">
            <span className="h-2 w-2 rounded-full bg-brand-500" />
            {submittedCount} submitted, not yet graded
          </span>
        )}
      </div>

      {/* The queue narrows below 2xl so the checklist's six rating columns fit beside it. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[280px_minmax(0,1fr)] 2xl:grid-cols-[340px_minmax(0,1fr)]">
        {/* Queue */}
        <aside className="lg:sticky lg:top-0 lg:self-start">
          {!selectedStudentId ? (
            <>
              {/* Step 1: find the student before any submission renders */}
              <div className="relative mb-3">
                <FontAwesomeIcon
                  icon={faMagnifyingGlass}
                  className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                />
                <input
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder="Search a student…"
                  aria-label="Search students"
                  className="w-full rounded-xl border border-gray-200 bg-surface py-2.5 pl-10 pr-3.5 text-sm text-gray-900 shadow-tile outline-none transition-colors placeholder:text-gray-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-600/30"
                />
              </div>

              {/* Filter by group */}
              {hasTeams && (
                <div role="group" aria-label="Filter by group" className="mb-3 flex flex-wrap gap-1.5">
                  {[
                    { key: ALL_GROUPS, label: "All groups" },
                    ...groupOptions,
                    ...(hasUngrouped ? [{ key: NO_GROUP, label: "No group" }] : []),
                  ].map((option) => {
                    const active = groupFilter === option.key;
                    const count =
                      option.key === ALL_GROUPS
                        ? studentGroups.length
                        : studentGroups.filter((g) =>
                            option.key === NO_GROUP ? !g.team_id : g.team_id === option.key,
                          ).length;
                    return (
                      <button
                        key={option.key}
                        onClick={() => setGroupFilter(option.key)}
                        aria-pressed={active}
                        className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                          active
                            ? "border-brand-600 bg-brand-600 text-white"
                            : "border-gray-200 bg-surface text-gray-600 hover:border-brand-300 hover:text-gray-900"
                        }`}
                      >
                        {option.label}
                        <span className={`tabular-nums ${active ? "text-white/80" : "text-gray-400"}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {selectedGroupStats && (
                <div className="mb-3 grid grid-cols-3 gap-2 rounded-xl border border-hairline bg-subtle p-3 text-center">
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-gray-900">
                      {selectedGroupStats.average === null ? "—" : `${selectedGroupStats.average}%`}
                    </p>
                    <p className="text-[11px] text-gray-500">Group average</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-gray-900">
                      {selectedGroupStats.graded}/{selectedGroupStats.assigned}
                    </p>
                    <p className="text-[11px] text-gray-500">Graded</p>
                  </div>
                  <div>
                    <p className="text-lg font-semibold tabular-nums text-gray-900">{selectedGroupStats.cases}</p>
                    <p className="text-[11px] text-gray-500">Different cases</p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                {loading && [0, 1, 2, 3, 4].map((i) => <StudentRowSkeleton key={i} />)}

                {!loading && filteredStudentGroups.length === 0 && (
                  <EmptyPanel
                    icon={faUserGraduate}
                    title={studentQuery || groupFilter !== ALL_GROUPS ? "No students found" : "No scenarios yet"}
                    body={
                      studentQuery || groupFilter !== ALL_GROUPS
                        ? "Try a different name or group."
                        : "Assigned scenarios show up here."
                    }
                  />
                )}

                {!loading &&
                  filteredStudentGroups.map((g, i) => (
                    <Fragment key={g.student_id}>
                    {hasTeams && (i === 0 || filteredStudentGroups[i - 1].team_id !== g.team_id) && (
                      <p className="px-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 first:pt-0">
                        {g.team_name ?? "No group"}
                      </p>
                    )}
                    <button
                      onClick={() => selectStudent(g.student_id)}
                      style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}
                      className="flex w-full animate-rise items-center gap-3 rounded-xl border border-hairline bg-surface p-3 text-left shadow-tile transition-all hover:border-brand-300 hover:shadow-tile-hover"
                    >
                      <Avatar
                        name={g.student_name}
                        src={g.student_picture_url}
                        userId={g.student_id}
                        sex={g.student_sex}
                        size="md"
                        tone="solid"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-gray-900">{g.student_name}</span>
                        <span className="block truncate text-xs text-gray-500">
                          {g.assignments.length} scenario{g.assignments.length === 1 ? "" : "s"}
                          {g.completed > 0 && ` · ${g.completed} completed`}
                        </span>
                      </span>
                      {g.awaiting > 0 && (
                        <span
                          title={`${g.awaiting} submitted, not yet graded`}
                          className="flex shrink-0 items-center gap-1.5 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold tabular-nums text-brand-700"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-brand-500" />
                          {g.awaiting}
                        </span>
                      )}
                    </button>
                    </Fragment>
                  ))}
              </div>
            </>
          ) : (
            <>
              {/* Step 2: the chosen student's submissions */}
              <button
                onClick={backToStudents}
                className="mb-3 flex w-full items-center gap-2.5 rounded-xl border border-hairline bg-surface p-3 text-left shadow-tile transition-colors hover:border-brand-300"
              >
                <FontAwesomeIcon icon={faChevronLeft} className="h-3.5 w-3.5 shrink-0 text-gray-400" />
                <Avatar
                  name={selectedStudent?.student_name}
                  src={selectedStudent?.student_picture_url}
                  userId={selectedStudent?.student_id}
                  sex={selectedStudent?.student_sex}
                  size="sm"
                  tone="solid"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-gray-900">
                    {selectedStudent?.student_name}
                  </span>
                  <span className="block text-xs text-gray-500">Change student</span>
                </span>
              </button>

              <AssignmentList
                key={selectedStudentId}
                assignments={studentAssignments}
                selectedId={selectedId}
                onSelect={selectAssignment}
                loading={loading}
              />
            </>
          )}
        </aside>

        {/* Grading panel */}
        <section ref={gradingRef} className="scroll-mt-4">
          {!selected ? (
            <div className="flex min-h-[380px] flex-col items-center justify-center rounded-2xl border border-dashed border-hairline bg-surface/60 px-6 py-16 text-center">
              <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-600">
                <FontAwesomeIcon icon={selectedStudentId ? faClipboardList : faUserGraduate} className="h-7 w-7" />
              </div>
              <p className="font-display text-lg font-semibold text-gray-900">
                {selectedStudentId ? "Pick a submission" : "Find a student"}
              </p>
              <p className="mt-1 max-w-xs text-sm text-gray-500">
                {selectedStudentId
                  ? "Choose a scenario from the list to rate each criterion and lock in a grade."
                  : "Search or select a student to see the scenarios they've submitted for review."}
              </p>
            </div>
          ) : (
            <AssignmentGrader
              key={selected.id}
              assignment={selected}
              onAssignmentChange={(patch) => updateAssignment(selected.id, patch)}
              onDirtyChange={setDirty}
            />
          )}
        </section>
      </div>
    </div>
  );
}
