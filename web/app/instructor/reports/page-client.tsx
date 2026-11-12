"use client";

import { useMemo } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faFileLines,
  faFileMedical,
  faFilePrescription,
  faHandHoldingMedical,
  faPeopleGroup,
  faListCheck,
  faNotesMedical,
  faUser,
  faUsers,
} from "@fortawesome/free-solid-svg-icons";
import {
  apiFetch,
  fetchFacultyScenarios,
  fetchFacultySections,
  fetchReturnDemos,
  fetchFacultyStudents,
} from "../../lib/api";
import { usePageData } from "../../lib/use-page-data";
import PageHeader from "../../components/PageHeader";
import ReportCenter, {
  defineReportType,
  sinceLabel,
  type FolderContents,
  type Target,
} from "../../components/ReportCenter";
import { daysSince, plural } from "../_overview/format";

/** No recorded activity for this long reads as "inactive". */
const INACTIVE_DAYS = 14;

interface AssessmentRow {
  id: string;
  title: string;
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

const loadReturnDemos = async () => (await fetchReturnDemos())?.returnDemos ?? [];

type FolderType = "section" | "patient_case" | "return_demo" | "quiz";

/**
 * What is inside one folder: a report of the whole thing where there is one,
 * and a report each per student and per group. The server decides what a
 * folder holds; this only dresses it as list rows.
 */
function folderLoader(type: FolderType): (id: string) => Promise<FolderContents | null> {
  return async (id) => {
    try {
      const res = await apiFetch(`/api/faculty/reports/folder/${type}/${id}`, { credentials: "include" });
      if (!res.ok) return null;
      const json = (await res.json()) as {
        whole: FolderContents["whole"];
        views: {
          id: string;
          label: string;
          type: string;
          items: { id: string; label: string; sub: string; flag: string | null }[];
        }[];
      };
      return {
        whole: json.whole,
        views: json.views.map((v) => ({
          ...v,
          items: v.items.map((it) => ({
            id: it.id,
            label: it.label,
            sub: it.sub,
            badges: it.flag ? [{ text: it.flag, tone: "slate" as const }] : [],
          })),
        })),
      };
    } catch {
      return null;
    }
  };
}

const sectionFolder = folderLoader("section");
const patientCaseFolder = folderLoader("patient_case");
const returnDemoFolder = folderLoader("return_demo");
const quizFolder = folderLoader("quiz");

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

const byName = (a: Target, b: Target) => a.label.localeCompare(b.label);
const newestFirst = (a: DatedTarget, b: DatedTarget) => b.createdAt.localeCompare(a.createdAt);

export default function FacultyReportsClient() {
  const students = usePageData("faculty:reports:students", loadStudents);
  const sections = usePageData("faculty:sections", fetchFacultySections);
  const scenarios = usePageData("faculty:reports:scenarios", loadScenarios);
  const assessments = usePageData("faculty:reports:assessments", loadAssessments);
  const returnDemos = usePageData("faculty:reports:return-demos", loadReturnDemos);

  const studentTargets = useMemo<StudentTarget[] | undefined>(
    () =>
      students.data?.map((s) => {
        const idleDays = daysSince(s.last_activity);
        const badges: StudentTarget["badges"] = [];
        if (s.risk_level === "at_risk") badges.push({ text: "Low performing", tone: "rose" });
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
        badges: c.atRisk > 0 ? [{ text: `${c.atRisk} low performing`, tone: "rose" as const }] : [],
        ...c,
      };
    });
  }, [sections.data, studentTargets]);

  const scenarioTargets = useMemo<DatedTarget[] | undefined>(
    () =>
      scenarios.data?.map((s) => ({
        id: s.id,
        label: s.title,
        sub: `${s.category} · ${plural(s.student_count, "student")} assigned`,
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
        sub: `${plural(a.question_count, "question")} · ${plural(a.student_count, "student")} assigned`,
        badges: a.is_published ? [] : [{ text: "Draft", tone: "slate" as const }],
        createdAt: a.created_at,
        flag: a.is_published,
      })),
    [assessments.data],
  );

  const returnDemoTargets = useMemo<DatedTarget[] | undefined>(
    () =>
      returnDemos.data?.map((d) => ({
        id: d.id,
        label: d.title,
        sub: `${plural(d.skills.length, "skill")} · ${plural(d.student_count, "student")} assigned · ${d.graded_count} graded`,
        badges: d.student_count === 0 ? [{ text: "Unassigned", tone: "slate" as const }] : [],
        createdAt: d.created_at,
        flag: d.student_count > 0,
      })),
    [returnDemos.data],
  );

  const noSections = sections.data !== undefined && sections.data.length === 0;

  const types = [
    defineReportType<SectionTarget>({
      type: "section",
      label: "Section",
      icon: faPeopleGroup,
      blurb: "Open a section to pull the whole class, or the report of one group or one student in it.",
      contents: ["Whole section", "Per group", "Per student: averages, course grades, quizzes, skill areas"],
      noun: "sections",
      list: {
        items: sectionTargets,
        loading: sections.loading,
        failed: Boolean(sections.error),
        sorts: [
          { id: "risk", label: "Most low performers", compare: (a, b) => b.atRisk - a.atRisk || byName(a, b) },
          { id: "name", label: "A–Z", compare: byName },
        ],
        folder: { noun: "students and groups", load: sectionFolder },
      },
    }),
    defineReportType<DatedTarget>({
      type: "scenario",
      label: "Patient Case",
      icon: faNotesMedical,
      blurb: "Open a patient case to pull the whole class, or its checklist and grades for one student or a group.",
      contents: ["Whole class", "Per student", "Per group, a column per member"],
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
        folder: { noun: "students and groups", load: patientCaseFolder },
      },
    }),
    defineReportType<DatedTarget>({
      type: "return_demo",
      label: "Return Demonstration",
      icon: faHandHoldingMedical,
      blurb: "Open a Return Demonstration to pull its checklist and grades, for one student or a whole group.",
      contents: ["Checklist steps with the grade beside each", "Per student", "Per group, a column per member"],
      noun: "return demonstrations",
      list: {
        items: returnDemoTargets,
        loading: returnDemos.loading,
        failed: Boolean(returnDemos.error),
        filters: [
          { id: "assigned", label: "Assigned", test: (t) => t.flag },
          { id: "unassigned", label: "Unassigned", test: (t) => !t.flag },
        ],
        sorts: [
          { id: "newest", label: "Newest", compare: newestFirst },
          { id: "name", label: "A–Z", compare: byName },
        ],
        folder: { noun: "students and groups", load: returnDemoFolder },
      },
    }),
    defineReportType<DatedTarget>({
      type: "assessment",
      label: "Quiz",
      icon: faListCheck,
      blurb: "Open a quiz to pull how the whole class did, or the questions and answers of one student or a group.",
      contents: ["Whole class", "Per student: every question and the answer given", "Per group, a column per member"],
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
        folder: { noun: "students and groups", load: quizFolder },
      },
    }),
  ];

  return (
    <div>
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faFileLines} className="h-3 w-3" />, label: "Report Center" }}
        title="Reports"
        subtitle="Preview and download PDF reports on your students, sections, scenarios, return demonstrations and assessments"
      />
      <ReportCenter
        endpoint="/api/faculty/reports"
        cachePrefix="faculty"
        types={types}
        historyTypes={[
          { type: "student", label: "Student", icon: faUser },
          { type: "section_group", label: "Group", icon: faUsers },
          { type: "patient_case", label: "Patient Case", icon: faNotesMedical },
          { type: "quiz", label: "Quiz answers", icon: faListCheck },
          { type: "discharge", label: "Discharge summary", icon: faFileMedical },
          { type: "case", label: "Case presentation", icon: faFilePrescription },
        ]}
        notice={
          noSections && (
            <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              You don&apos;t manage any sections yet, so there&apos;s nothing to report on. Your Dean or
              Program Chair assigns sections from their Instructors page.
            </p>
          )
        }
      />
    </div>
  );
}
