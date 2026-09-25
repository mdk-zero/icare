"use client";

import { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faCalendarCheck,
  faFileLines,
  faFileMedical,
  faLayerGroup,
  faListCheck,
  faNotesMedical,
  faTriangleExclamation,
  faUser,
  faUserClock,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import {
  apiFetch,
  fetchFacultyScenarios,
  fetchFacultySections,
  fetchFacultyStudents,
} from "../../lib/api";
import { usePageData } from "../../lib/use-page-data";
import type { RecentReport } from "../../lib/reports/types";
import PageHeader from "../../components/PageHeader";
import ReportCenter, {
  defineReportType,
  sinceLabel,
  type Suggestion,
  type Target,
} from "../../components/ReportCenter";
import { daysSince, plural } from "../_overview/format";

/** No recorded activity for this long reads as "inactive". */
const INACTIVE_DAYS = 14;

/** A whole-scope report older than this is worth suggesting again. */
const STALE_DAYS = 7;

interface AssessmentRow {
  id: string;
  title: string;
  difficulty: string;
  is_published: boolean;
  question_count: number;
  student_count: number;
  created_at: string;
}

// Module-level loaders, so the cache sees one stable function per key.
const loadStudents = () => fetchFacultyStudents();
const loadScenarios = () => fetchFacultyScenarios();
async function loadAssessments(): Promise<AssessmentRow[]> {
  const res = await apiFetch("/api/faculty/assessments", { credentials: "include" });
  if (!res.ok) throw new Error("Unable to load assessments");
  const json = (await res.json()) as { assessments?: AssessmentRow[] };
  return json.assessments ?? [];
}

interface StudentTarget extends Target {
  risk: "safe" | "at_risk" | null;
  /** Days since last activity; null when there has never been any. */
  idleDays: number | null;
  sectionId: string | null;
}

interface SectionTarget extends Target {
  students: number;
  atRisk: number;
}

interface DatedTarget extends Target {
  createdAt: string;
  flag: boolean;
}

const isInactive = (t: StudentTarget) => t.idleDays === null || t.idleDays >= INACTIVE_DAYS;
const byName = (a: Target, b: Target) => a.label.localeCompare(b.label);
const newestFirst = (a: DatedTarget, b: DatedTarget) => b.createdAt.localeCompare(a.createdAt);

/**
 * At risk first, then the longest quiet, then by name: the students a report
 * is most likely to be pulled for are at the top without being asked.
 */
function byAttention(a: StudentTarget, b: StudentTarget): number {
  const risk = (t: StudentTarget) => (t.risk === "at_risk" ? 0 : 1);
  const idle = (t: StudentTarget) => t.idleDays ?? Number.MAX_SAFE_INTEGER;
  return risk(a) - risk(b) || idle(b) - idle(a) || byName(a, b);
}

/** What's worth pulling now — from the lists already on the page, no AI. */
function suggestFor(
  students: StudentTarget[] | undefined,
  sections: SectionTarget[] | undefined,
  recent: RecentReport[] | undefined,
): Suggestion[] {
  if (!students || students.length === 0) return [];
  const out: Suggestion[] = [];

  const atRisk = students.filter((s) => s.risk === "at_risk");
  if (atRisk.length === 1) {
    out.push({
      id: "at-risk",
      icon: faTriangleExclamation,
      tone: "rose",
      title: `${atRisk[0].label} is at risk`,
      detail: "Skill area profile, skill assessment history and clinical activity in one report.",
      cta: "Preview their report",
      action: { kind: "preview", type: "student", targetId: atRisk[0].id, subject: atRisk[0].label },
    });
  } else if (atRisk.length > 1) {
    out.push({
      id: "at-risk",
      icon: faTriangleExclamation,
      tone: "rose",
      title: `${atRisk.length} students at risk`,
      detail: "Their reports are a ready brief for the next check-in.",
      cta: "Show them",
      action: { kind: "filter", type: "student", filter: "at-risk" },
    });
  }

  // The section with the largest share at risk, not the largest count: a
  // big section always has more of everything.
  const worst = (sections ?? [])
    .filter((s) => s.atRisk > 0)
    .sort((a, b) => b.atRisk / b.students - a.atRisk / a.students)[0];
  if (worst) {
    out.push({
      id: "section",
      icon: faLayerGroup,
      tone: "amber",
      title: worst.label,
      detail:
        (sections?.length ?? 0) > 1
          ? `${worst.atRisk} of ${worst.students} at risk — the highest share of your sections.`
          : `${worst.atRisk} of ${worst.students} students at risk.`,
      cta: "Preview section report",
      action: { kind: "preview", type: "section", targetId: worst.id, subject: worst.label },
    });
  }

  const idle = students.filter(isInactive);
  if (idle.length > 0) {
    out.push({
      id: "inactive",
      icon: faUserClock,
      tone: "amber",
      title: `${plural(idle.length, "student")} inactive`,
      detail: `No recorded activity in ${INACTIVE_DAYS}+ days.`,
      cta: "Show them",
      action: { kind: "filter", type: "student", filter: "inactive" },
    });
  }

  // Wait for history before judging the roster stale, or it flashes "never".
  if (recent) {
    const last = recent.find((r) => r.type === "roster");
    const age = last ? daysSince(last.created_at) : null;
    if (!last || (age !== null && age >= STALE_DAYS)) {
      out.push({
        id: "roster",
        icon: faUsers,
        tone: "brand",
        title: "Roster summary",
        detail: last
          ? `Last pulled ${sinceLabel(last.created_at)}.`
          : "Every student you supervise, one row each.",
        cta: "Preview",
        action: { kind: "preview", type: "roster", targetId: null, subject: "Roster summary" },
      });
    }
  }

  return out;
}

export default function FacultyReportsClient() {
  const students = usePageData("faculty:reports:students", loadStudents);
  const sections = usePageData("faculty:sections", fetchFacultySections);
  const scenarios = usePageData("faculty:reports:scenarios", loadScenarios);
  const assessments = usePageData("faculty:reports:assessments", loadAssessments);

  const studentTargets = useMemo<StudentTarget[] | undefined>(
    () =>
      students.data?.map((s) => {
        const idleDays = daysSince(s.last_activity);
        const badges: StudentTarget["badges"] = [];
        if (s.risk_level === "at_risk") badges.push({ text: "At risk", tone: "rose" });
        if (idleDays === null) badges.push({ text: "No activity yet", tone: "amber" });
        else if (idleDays >= INACTIVE_DAYS) badges.push({ text: `Inactive ${idleDays}d`, tone: "amber" });
        return {
          id: s.id,
          label: s.name,
          sub: [
            s.section ?? "No section",
            s.email,
            s.last_activity ? `active ${sinceLabel(s.last_activity)}` : null,
          ]
            .filter(Boolean)
            .join(" · "),
          badges,
          risk: s.risk_level ?? null,
          idleDays,
          sectionId: s.section_id ?? null,
        };
      }),
    [students.data],
  );

  const sectionTargets = useMemo<SectionTarget[] | undefined>(() => {
    if (!sections.data) return undefined;
    const counts = new Map<string, { students: number; atRisk: number }>();
    for (const s of studentTargets ?? []) {
      if (!s.sectionId) continue;
      const c = counts.get(s.sectionId) ?? { students: 0, atRisk: 0 };
      c.students += 1;
      if (s.risk === "at_risk") c.atRisk += 1;
      counts.set(s.sectionId, c);
    }
    return sections.data.map((section) => {
      const c = counts.get(section.id) ?? { students: 0, atRisk: 0 };
      return {
        id: section.id,
        label: section.name,
        sub: plural(c.students, "student"),
        badges: c.atRisk > 0 ? [{ text: `${c.atRisk} at risk`, tone: "rose" as const }] : [],
        ...c,
      };
    });
  }, [sections.data, studentTargets]);

  // Attendance is per section too, but its rows say nothing about risk.
  const attendanceTargets = useMemo<Target[] | undefined>(
    () => sectionTargets?.map(({ id, label, sub }) => ({ id, label, sub })),
    [sectionTargets],
  );

  const scenarioTargets = useMemo<DatedTarget[] | undefined>(
    () =>
      scenarios.data?.map((s) => ({
        id: s.id,
        label: s.title,
        sub: `${s.difficulty} · ${s.category} · ${plural(s.student_count, "student")} assigned`,
        badges: s.student_count === 0 ? [{ text: "Unassigned", tone: "slate" as const }] : [],
        createdAt: s.created_at,
        flag: s.student_count > 0,
      })),
    [scenarios.data],
  );

  const assessmentTargets = useMemo<DatedTarget[] | undefined>(
    () =>
      assessments.data?.map((a) => ({
        id: a.id,
        label: a.title,
        sub: `${a.difficulty} · ${plural(a.question_count, "question")} · ${plural(a.student_count, "student")} assigned`,
        badges: a.is_published ? [] : [{ text: "Draft", tone: "slate" as const }],
        createdAt: a.created_at,
        flag: a.is_published,
      })),
    [assessments.data],
  );

  const sectionOptions = (sections.data ?? []).map((s) => ({ id: s.id, label: s.name }));
  const noSections = sections.data !== undefined && sections.data.length === 0;

  const types = [
    defineReportType<StudentTarget>({
      type: "student",
      label: "Student",
      icon: faUser,
      blurb: "One student's skill area profile, skill assessment history and clinical activity.",
      contents: ["Score summary", "Skill areas", "Recent attempts", "Clinical activity"],
      noun: "students",
      list: {
        items: studentTargets,
        loading: students.loading,
        failed: Boolean(students.error),
        filters: [
          { id: "at-risk", label: "At risk", test: (t) => t.risk === "at_risk" },
          { id: "inactive", label: `Inactive ${INACTIVE_DAYS}d+`, test: isInactive },
          { id: "unscored", label: "No risk score yet", test: (t) => t.risk === null },
        ],
        sorts: [
          { id: "attention", label: "Needs attention", compare: byAttention },
          { id: "name", label: "A–Z", compare: byName },
        ],
        facet: { label: "Section", options: sectionOptions, valueOf: (t) => t.sectionId },
      },
    }),
    defineReportType<SectionTarget>({
      type: "section",
      label: "Section",
      icon: faLayerGroup,
      blurb: "The whole class: roster, averages and skill area means.",
      contents: ["Class summary", "Roster with averages", "Skill area means"],
      noun: "sections",
      list: {
        items: sectionTargets,
        loading: sections.loading,
        failed: Boolean(sections.error),
        sorts: [
          { id: "risk", label: "Most at risk", compare: (a, b) => b.atRisk - a.atRisk || byName(a, b) },
          { id: "name", label: "A–Z", compare: byName },
        ],
      },
    }),
    defineReportType<Target>({
      type: "attendance",
      label: "Attendance",
      icon: faCalendarCheck,
      blurb: "Clinical duty attendance for a section, by student and by shift.",
      contents: ["Present / late / absent tally", "By student with rate", "By shift"],
      noun: "sections",
      list: {
        items: attendanceTargets,
        loading: sections.loading,
        failed: Boolean(sections.error),
        sorts: [{ id: "name", label: "A–Z", compare: byName }],
      },
    }),
    defineReportType<DatedTarget>({
      type: "scenario",
      label: "Scenario",
      icon: faNotesMedical,
      blurb: "Who a scenario went to, how many finished, and how they scored.",
      contents: ["Completion rate", "Average score", "Every assignment"],
      noun: "scenarios",
      list: {
        items: scenarioTargets,
        loading: scenarios.loading,
        failed: Boolean(scenarios.error),
        filters: [
          { id: "assigned", label: "Assigned", test: (t) => t.flag },
          { id: "unassigned", label: "Unassigned", test: (t) => !t.flag },
        ],
        sorts: [
          { id: "newest", label: "Newest", compare: newestFirst },
          { id: "name", label: "A–Z", compare: byName },
        ],
      },
    }),
    defineReportType<DatedTarget>({
      type: "assessment",
      label: "Assessment",
      icon: faListCheck,
      blurb: "How a skill assessment went: attempts, score bands and pass rate.",
      contents: ["Attempts and pass rate", "Score distribution", "Every attempt"],
      noun: "assessments",
      list: {
        items: assessmentTargets,
        loading: assessments.loading,
        failed: Boolean(assessments.error),
        filters: [
          { id: "published", label: "Published", test: (t) => t.flag },
          { id: "draft", label: "Draft", test: (t) => !t.flag },
        ],
        sorts: [
          { id: "newest", label: "Newest", compare: newestFirst },
          { id: "name", label: "A–Z", compare: byName },
        ],
      },
    }),
    defineReportType({
      type: "roster",
      label: "Roster summary",
      icon: faUsers,
      blurb: "Every student you supervise, one row each — nothing to pick.",
      contents: ["Overall average", "Students without attempts", "Every student with section"],
      noun: "students",
      scope:
        studentTargets && sections.data
          ? `Covers ${plural(studentTargets.length, "student")} across ${plural(sections.data.length, "section")}.`
          : undefined,
    }),
  ];

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faFileLines} className="h-3 w-3" />, label: "Report Center" }}
        title="Reports"
        subtitle="Preview and export PDF or CSV reports on your students, sections, scenarios and assessments"
      />
      <ReportCenter
        endpoint="/api/faculty/reports"
        cachePrefix="faculty"
        types={types}
        suggest={(recent) => suggestFor(studentTargets, sectionTargets, recent)}
        historyTypes={[{ type: "discharge", label: "Discharge summary", icon: faFileMedical }]}
        notice={
          noSections && (
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              You don&apos;t manage any sections yet, so there&apos;s nothing to report on. An admin
              assigns sections from Admin → Faculty.
            </p>
          )
        }
      />
    </div>
  );
}
