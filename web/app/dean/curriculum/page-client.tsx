"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpFromBracket,
  faBookOpen,
  faChevronDown,
  faChevronRight,
  faCircleCheck,
  faDiagramProject,
  faFileArrowUp,
  faFilePdf,
  faLayerGroup,
  faPenToSquare,
  faPlus,
  faTrashCan,
  faTriangleExclamation,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../components/PageHeader";
import FilterSelect from "../../components/FilterSelect";
import StatTile from "../../components/StatTile";
import ActionsMenu from "../../components/ActionsMenu";
import ConfirmModal from "../../components/ConfirmModal";
import { EcgLoader } from "../../components/EcgLoader";
import { toast } from "../../components/Toast";
import { usePageData } from "../../lib/use-page-data";
import { isLabCourse } from "../../lib/bsn-curriculum";
import {
  deleteCurriculum,
  deleteCurriculumCourse,
  fetchCurricula,
  fetchCurriculum,
  fetchCurriculumSourceUrl,
  importCurriculum,
  updateCurriculum,
  type CurriculumImportStage,
  type CurriculumSummary,
} from "../../lib/api";
import {
  CURRICULUM_LIMITS,
  byYearAndTerm,
  courseUnits,
  curriculumIssues,
  curriculumStats,
  sumUnits,
  termLabel,
  yearLabel,
  type CurriculumCourseRow,
  type CurriculumIssue,
} from "../../lib/curriculum";
import { CourseModal, NameModal } from "./course-modal";

const NONE: CurriculumSummary[] = [];
const NO_COURSES: CurriculumCourseRow[] = [];

const STAGE_LABEL: Record<CurriculumImportStage, string> = {
  uploading: "Uploading",
  reading: "Opening",
  analyzing: "Reading the courses in",
  saving: "Saving",
};

async function loadCurricula() {
  const result = await fetchCurricula();
  return { curricula: result.data?.curricula ?? NONE, error: result.error ?? null };
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

type Dialog =
  | { kind: "course"; course: CurriculumCourseRow | null; start: { year_level: number; term: number } }
  | { kind: "name"; curriculum: { id: string; name: string } | null };

interface Confirmation {
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
  run: () => Promise<{ error?: string }>;
  done: string;
}

/** The selected curriculum follows the URL, so reviewing one survives a trip to another page and back. */
function setSelectedInUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set("id", id);
  else url.searchParams.delete("id");
  window.history.replaceState(window.history.state, "", url);
}

function StatusBadge({ inUse }: { inUse: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${
        inUse ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-gray-100 text-gray-600 ring-gray-500/20"
      }`}
    >
      {inUse && <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />}
      {inUse ? "In use" : "Not in use"}
    </span>
  );
}

function CodeChips({ ids, codeOf }: { ids: string[]; codeOf: Map<string, string> }) {
  if (ids.length === 0) return <span className="text-gray-400">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {ids.map((id) => (
        <span key={id} className="rounded bg-brand-600/10 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-brand-700">
          {codeOf.get(id) ?? "?"}
        </span>
      ))}
    </span>
  );
}

/** One term's courses. A row opens its course; the menu is there for deleting. */
function TermTable({
  term,
  courses,
  codeOf,
  issuesByCourse,
  onAdd,
  onEdit,
  onDelete,
}: {
  term: number;
  courses: CurriculumCourseRow[];
  codeOf: Map<string, string>;
  issuesByCourse: Map<string, string[]>;
  onAdd: () => void;
  onEdit: (course: CurriculumCourseRow) => void;
  onDelete: (course: CurriculumCourseRow) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-tile">
      <div className="flex items-center justify-between gap-3 border-b border-hairline bg-subtle px-4 py-2.5">
        <h3 className="text-sm font-semibold text-gray-900">{termLabel(term)}</h3>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums text-gray-500">{plural(sumUnits(courses), "unit")}</span>
          <button
            type="button"
            onClick={onAdd}
            className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-600/10"
          >
            <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
            Add course
          </button>
        </div>
      </div>
      {/* Relative, so the screen-reader-only header is clipped here too and can't widen the whole page on a phone. */}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left text-sm">
          <thead>
            <tr className="border-b border-hairline text-xs text-gray-500">
              <th scope="col" className="w-32 px-4 py-2 font-medium">Code</th>
              <th scope="col" className="px-2 py-2 font-medium">Title</th>
              <th scope="col" className="w-12 px-2 py-2 text-right font-medium">Lec</th>
              <th scope="col" className="w-12 px-2 py-2 text-right font-medium">Lab</th>
              <th scope="col" className="w-14 px-2 py-2 text-right font-medium">Units</th>
              <th scope="col" className="w-44 px-3 py-2 font-medium">Pre-requisites</th>
              <th scope="col" className="w-36 px-2 py-2 font-medium">Co-requisites</th>
              <th scope="col" className="w-10 px-2 py-2"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline">
            {courses.map((course) => {
              const issues = issuesByCourse.get(course.id);
              return (
                <tr
                  key={course.id}
                  onClick={() => onEdit(course)}
                  className="cursor-pointer align-top transition-colors hover:bg-subtle"
                >
                  <td className="px-4 py-2.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEdit(course);
                      }}
                      className="inline-flex items-center gap-1.5 text-left font-mono text-xs font-semibold text-brand-700 hover:underline"
                    >
                      {issues && (
                        <FontAwesomeIcon
                          icon={faTriangleExclamation}
                          title={issues.join(" ")}
                          className="h-3 w-3 shrink-0 text-amber-500"
                        />
                      )}
                      {course.code}
                    </button>
                  </td>
                  <td className="px-2 py-2.5 text-gray-800">{course.title}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">{course.lecture_units}</td>
                  <td className="px-2 py-2.5 text-right tabular-nums text-gray-600">{course.lab_units}</td>
                  <td className="px-2 py-2.5 text-right font-semibold tabular-nums text-gray-900">{courseUnits(course)}</td>
                  <td className="px-3 py-2.5">
                    <CodeChips ids={course.prerequisite_ids} codeOf={codeOf} />
                    {course.requisite_note && <p className="mt-1 text-xs text-gray-500">{course.requisite_note}</p>}
                  </td>
                  <td className="px-2 py-2.5">
                    <CodeChips ids={course.corequisite_ids} codeOf={codeOf} />
                  </td>
                  <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <ActionsMenu
                      variant="compact"
                      label={`Actions for ${course.code}`}
                      actions={[
                        { label: "Edit", icon: faPenToSquare, onClick: () => onEdit(course) },
                        { label: "Delete", icon: faTrashCan, onClick: () => onDelete(course), danger: true },
                      ]}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** What to look at: the checks that clear themselves as courses are fixed, and the notes from reading the PDF. */
function ChecksPanel({
  issues,
  notes,
  onOpen,
  onDismissNotes,
}: {
  issues: CurriculumIssue[];
  notes: string[];
  onOpen: (courseId: string) => void;
  onDismissNotes: () => void;
}) {
  const [open, setOpen] = useState(true);
  const total = issues.length + notes.length;
  if (total === 0) return null;
  return (
    <div className="mb-4 overflow-hidden rounded-2xl border border-amber-300 bg-amber-50">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2.5 px-4 py-3 text-left text-sm font-semibold text-amber-800"
      >
        <FontAwesomeIcon icon={faTriangleExclamation} className="h-4 w-4 shrink-0 text-amber-600" />
        <span className="flex-1">{plural(total, "thing")} to check</span>
        <FontAwesomeIcon icon={open ? faChevronDown : faChevronRight} className="h-3 w-3 text-amber-700" />
      </button>
      {open && (
        <div className="space-y-3 border-t border-amber-200 px-4 py-3 text-sm text-amber-800">
          {issues.length > 0 && (
            <ul className="space-y-1.5">
              {issues.map((issue) => (
                <li key={issue.key} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="min-w-0 flex-1 basis-64">{issue.message}</span>
                  {issue.course_id && (
                    <button
                      type="button"
                      onClick={() => onOpen(issue.course_id as string)}
                      className="shrink-0 text-xs font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-800"
                    >
                      Open course
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          {notes.length > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-amber-700">Notes from reading the PDF</p>
                <button
                  type="button"
                  onClick={onDismissNotes}
                  className="text-xs font-semibold text-amber-700 underline underline-offset-2 hover:text-amber-800"
                >
                  Dismiss notes
                </button>
              </div>
              <ul className="list-disc space-y-1 pl-5">
                {notes.map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CurriculumClient() {
  const params = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(params.get("id"));
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [importing, setImporting] = useState<{ fileName: string; stage: CurriculumImportStage; percent: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const list = usePageData("admin:curricula", loadCurricula);
  const curricula = list.data?.curricula ?? NONE;
  const current = curricula.find((c) => c.id === selectedId) ?? curricula.find((c) => c.is_active) ?? curricula[0] ?? null;
  const inUse = curricula.find((c) => c.is_active) ?? null;

  const currentId = current?.id ?? null;
  const detail = usePageData(currentId ? `admin:curriculum:${currentId}` : null, () => fetchCurriculum(currentId as string));
  const courses = detail.data?.data?.courses ?? NO_COURSES;
  const analysis = detail.data?.data?.curriculum.analysis ?? null;

  const select = (id: string | null) => {
    setSelectedId(id);
    setSelectedInUrl(id);
  };

  const reload = async () => {
    await Promise.all([list.refresh(), detail.refresh()]);
  };

  // Reading a PDF is one AI call with nothing to report, so the bar eases along rather than sitting still.
  const analyzing = importing?.stage === "analyzing";
  useEffect(() => {
    if (!analyzing) return;
    const timer = setInterval(
      () => setImporting((p) => (p && p.stage === "analyzing" ? { ...p, percent: Math.min(95, p.percent + 1) } : p)),
      700,
    );
    return () => clearInterval(timer);
  }, [analyzing]);

  const startImport = async (file: File) => {
    setImportError(null);
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      setImportError("Upload the curriculum as a PDF.");
      return;
    }
    if (file.size > CURRICULUM_LIMITS.fileBytes) {
      setImportError(`PDFs can be at most ${CURRICULUM_LIMITS.fileBytes / (1024 * 1024)} MB.`);
      return;
    }
    setImporting({ fileName: file.name, stage: "uploading", percent: 0 });
    const result = await importCurriculum(file, ({ stage, percent }) =>
      // Never step backwards (the last upload event can land after reading has begun).
      setImporting((p) => (p ? { ...p, stage, percent: Math.max(p.percent, percent) } : p)),
    );
    setImporting(null);
    if ("error" in result) {
      setImportError(result.error);
      return;
    }
    select(result.curriculum_id);
    await list.refresh();
    toast(`Read ${plural(result.course_count, "course")} from ${file.name}. Check them before using this curriculum.`);
  };

  const stats = useMemo(() => curriculumStats(courses), [courses]);
  const issues = useMemo(() => curriculumIssues(courses, analysis), [courses, analysis]);
  const groups = useMemo(() => byYearAndTerm(courses), [courses]);
  const codeOf = useMemo(() => new Map(courses.map((c) => [c.id, c.code])), [courses]);
  const issuesByCourse = useMemo(() => {
    const out = new Map<string, string[]>();
    for (const issue of issues) {
      if (issue.course_id) out.set(issue.course_id, [...(out.get(issue.course_id) ?? []), issue.message]);
    }
    return out;
  }, [issues]);
  const notes = analysis?.notes ?? [];

  const openSource = async () => {
    if (!current) return;
    // Opened before the wait, or a popup blocker takes it for an unprompted window.
    const tab = window.open("", "_blank");
    const result = await fetchCurriculumSourceUrl(current.id);
    if (result.error !== undefined) {
      tab?.close();
      toast(result.error, "error");
      return;
    }
    if (tab) {
      tab.opener = null;
      tab.location.href = result.data.url;
    }
  };

  const askUse = () => {
    if (!current) return;
    const labs = courses.filter((c) => isLabCourse(c.code)).length;
    const offers =
      labs > 0
        ? `Assign Course will offer its ${plural(labs, "lab course")}.`
        : "None of its course codes end in L, so Assign Course keeps the built-in list of NCM laboratory courses.";
    setConfirmation({
      title: `Use ${current.name}?`,
      message: `${inUse ? `It takes over from ${inUse.name}, which is kept. ` : ""}${offers} Existing course assignments and grades don't change.`,
      confirmLabel: "Use this curriculum",
      danger: false,
      run: () => updateCurriculum(current.id, { is_active: true }),
      done: `${current.name} is now in use`,
    });
  };

  const askStop = () => {
    if (!current) return;
    setConfirmation({
      title: `Stop using ${current.name}?`,
      message: "It is kept, and Assign Course goes back to the built-in list of NCM laboratory courses. Existing course assignments and grades don't change.",
      confirmLabel: "Stop using",
      danger: false,
      run: () => updateCurriculum(current.id, { is_active: false }),
      done: `${current.name} is no longer in use`,
    });
  };

  const askDelete = () => {
    if (!current) return;
    setConfirmation({
      title: `Delete ${current.name}?`,
      message: `Its ${plural(current.course_count, "course")}${current.has_source ? " and the uploaded PDF" : ""} are removed for good.${
        current.is_active ? " Assign Course goes back to the built-in list of NCM laboratory courses." : ""
      } Existing course assignments and grades don't change.`,
      confirmLabel: "Delete curriculum",
      danger: true,
      run: async () => {
        const result = await deleteCurriculum(current.id);
        if (result.error === undefined) select(null);
        return result;
      },
      done: `${current.name} deleted`,
    });
  };

  const askDeleteCourse = (course: CurriculumCourseRow) => {
    if (!current) return;
    const dependents = courses.filter((c) => c.prerequisite_ids.includes(course.id) || c.corequisite_ids.includes(course.id));
    setConfirmation({
      title: `Delete ${course.code}?`,
      message:
        dependents.length > 0
          ? `It comes off the requisites of ${dependents.map((c) => c.code).join(", ")}.`
          : "No other course requires it.",
      confirmLabel: "Delete course",
      danger: true,
      run: () => deleteCurriculumCourse(current.id, course.id),
      done: `${course.code} deleted`,
    });
  };

  const runConfirmation = async () => {
    if (!confirmation) return;
    setConfirming(true);
    setConfirmError(null);
    const result = await confirmation.run();
    setConfirming(false);
    if (result.error !== undefined) {
      setConfirmError(result.error);
      return;
    }
    toast(confirmation.done);
    setConfirmation(null);
    await reload();
  };

  const dismissNotes = async () => {
    if (!current) return;
    const result = await updateCurriculum(current.id, { dismiss_notes: true });
    if (result.error !== undefined) toast(result.error, "error");
    else await detail.refresh();
  };

  const pickFile = () => inputRef.current?.click();
  const dropFile = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && !importing) void startImport(file);
  };

  const lastPlace = courses.length
    ? { year_level: courses[courses.length - 1].year_level, term: courses[courses.length - 1].term }
    : { year_level: 1, term: 1 };

  return (
    <div className="pb-4">
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faDiagramProject} className="h-3.5 w-3.5" />, label: "Curriculum" }}
        title="Curriculum"
        subtitle="Your program of study: year levels, courses, units, pre-requisites and co-requisites"
        action={{
          icon: <FontAwesomeIcon icon={faArrowUpFromBracket} className="h-4 w-4" />,
          onClick: pickFile,
          label: "Upload a curriculum PDF",
          text: "Upload PDF",
          disabled: importing !== null,
        }}
      />
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void startImport(file);
          // Cleared so picking the same file again still fires.
          e.target.value = "";
        }}
      />

      {list.data?.error && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-4 w-4 shrink-0" />
          {list.data.error}
        </div>
      )}

      {importing && (
        <div className="mb-4 rounded-2xl border border-brand-600/30 bg-surface px-4 py-3 shadow-tile">
          <div className="flex items-center gap-2.5 text-sm text-gray-700">
            <EcgLoader className="shrink-0 text-brand-600" />
            <span className="min-w-0 flex-1 truncate" title={importing.fileName}>
              {STAGE_LABEL[importing.stage]} {importing.fileName}…
            </span>
            <span className="text-xs font-semibold tabular-nums text-brand-700">{importing.percent}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Reading the curriculum"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={importing.percent}
            className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-600/10"
          >
            <div
              className="h-full rounded-full bg-brand-600 transition-[width] duration-500 ease-out"
              style={{ width: `${importing.percent}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {importing.stage === "analyzing" ? "This can take up to a minute for a long curriculum." : " "}
          </p>
        </div>
      )}

      {importError && (
        <div className="mb-4 flex items-start justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {importError}
          <button type="button" onClick={() => setImportError(null)} aria-label="Dismiss" className="shrink-0 text-rose-500 hover:text-rose-700">
            <FontAwesomeIcon icon={faXmark} className="h-4 w-4" />
          </button>
        </div>
      )}

      {list.loading ? (
        <p className="flex items-center gap-2 text-sm text-gray-500">
          <EcgLoader className="text-brand-600" /> Loading your curriculum…
        </p>
      ) : !current ? (
        !list.data?.error &&
        !importing && (
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={dropFile}
            className={`rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
              dragging ? "border-brand-600 bg-brand-600/5" : "border-gray-300 bg-surface"
            }`}
          >
            <FontAwesomeIcon icon={faFileArrowUp} className="h-8 w-8 text-brand-600" />
            <h2 className="mt-3 font-display text-lg font-semibold text-gray-900">Upload your curriculum</h2>
            <p className="mx-auto mt-1 max-w-lg text-sm text-gray-600">
              Drop a PDF here, scanned or not. It is read into year levels, terms, courses, units, pre-requisites and
              co-requisites for you to check and correct. Nothing is used until you say so.
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={pickFile}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700"
              >
                <FontAwesomeIcon icon={faArrowUpFromBracket} className="h-4 w-4" />
                Choose PDF
              </button>
              <button
                type="button"
                onClick={() => setDialog({ kind: "name", curriculum: null })}
                className="rounded-xl border border-gray-300 bg-surface px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:border-brand-600/50 hover:text-brand-700"
              >
                Start blank
              </button>
            </div>
          </div>
        )
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            {curricula.length > 1 ? (
              <FilterSelect value={current.id} onChange={(e) => select(e.target.value)} aria-label="Curriculum" className="max-w-full sm:max-w-md">
                {curricula.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.is_active ? "In use" : "Not in use"}
                  </option>
                ))}
              </FilterSelect>
            ) : (
              <h2 className="min-w-0 font-display text-lg font-semibold text-gray-900">{current.name}</h2>
            )}
            <StatusBadge inUse={current.is_active} />
            {current.has_source && (
              <button
                type="button"
                onClick={() => void openSource()}
                className="inline-flex min-w-0 items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline"
              >
                <FontAwesomeIcon icon={faFilePdf} className="h-3.5 w-3.5 shrink-0" />
                <span className="max-w-[16rem] truncate">{current.source_name ?? "View the PDF"}</span>
              </button>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => setDialog({ kind: "course", course: null, start: lastPlace })}
                className="inline-flex items-center gap-2 rounded-xl border border-gray-300 bg-surface px-3.5 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-brand-600/50 hover:text-brand-700"
              >
                <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
                Add course
              </button>
              <ActionsMenu
                variant="compact"
                label="Curriculum actions"
                actions={[
                  {
                    label: "Rename",
                    icon: faPenToSquare,
                    onClick: () => setDialog({ kind: "name", curriculum: { id: current.id, name: current.name } }),
                  },
                  ...(current.is_active ? [{ label: "Stop using", icon: faXmark, onClick: askStop }] : []),
                  {
                    label: "New blank curriculum",
                    icon: faPlus,
                    onClick: () => setDialog({ kind: "name", curriculum: null }),
                  },
                  { label: "Delete", icon: faTrashCan, onClick: askDelete, danger: true },
                ]}
              />
            </div>
          </div>

          {!current.is_active && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-600/30 bg-brand-600/5 px-4 py-3 text-sm text-gray-700">
              <p className="min-w-0 flex-1 basis-72">
                <span className="font-semibold text-gray-900">Not in use yet.</span>{" "}
                {courses.length === 0
                  ? "Add its courses, then use it."
                  : current.source_name
                    ? "Check these courses against the PDF and correct anything misread, then use it."
                    : "Once its courses are right, use it."}{" "}
                Assign Course then offers its lab courses
                {inUse ? `, in place of ${inUse.name}` : ""}.
              </p>
              <button
                type="button"
                onClick={askUse}
                disabled={courses.length === 0}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700 disabled:opacity-60"
              >
                <FontAwesomeIcon icon={faCircleCheck} className="h-4 w-4" />
                Use this curriculum
              </button>
            </div>
          )}

          <div className="mb-4 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile
              icon={faBookOpen}
              value={stats.courses}
              label="Courses"
              caption={stats.years > 0 ? `Across ${plural(stats.years, "year level")}` : "None yet"}
            />
            <StatTile icon={faLayerGroup} value={stats.units} label="Total units" caption={`${stats.lecture} lecture, ${stats.lab} lab / RLE`} />
            <StatTile
              icon={faDiagramProject}
              value={stats.prerequisites + stats.corequisites}
              label="Requisites"
              caption={`${stats.prerequisites} pre-req, ${stats.corequisites} co-req`}
            />
            <StatTile
              icon={faTriangleExclamation}
              value={issues.length + notes.length}
              label="To check"
              caption={issues.length + notes.length === 0 ? "Nothing flagged" : "Listed below"}
              valueColor={issues.length + notes.length > 0 ? "text-amber-600" : undefined}
            />
          </div>

          <ChecksPanel
            key={current.id}
            issues={issues}
            notes={notes}
            onOpen={(courseId) => {
              const course = courses.find((c) => c.id === courseId);
              if (course) setDialog({ kind: "course", course, start: lastPlace });
            }}
            onDismissNotes={() => void dismissNotes()}
          />

          {detail.loading ? (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <EcgLoader className="text-brand-600" /> Loading the courses…
            </p>
          ) : detail.data?.error ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-4 w-4 shrink-0" />
              {detail.data.error}
            </div>
          ) : courses.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-surface px-6 py-10 text-center">
              <p className="text-sm text-gray-600">No courses yet. Add the first one to start building this curriculum.</p>
              <button
                type="button"
                onClick={() => setDialog({ kind: "course", course: null, start: lastPlace })}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700"
              >
                <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />
                Add course
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {groups.map(({ year, terms }) => (
                <section key={year} aria-label={yearLabel(year)}>
                  <div className="mb-2 flex items-baseline justify-between gap-3">
                    <h2 className="font-display text-base font-semibold text-gray-900">{yearLabel(year)}</h2>
                    <span className="text-xs tabular-nums text-gray-500">
                      {plural(sumUnits(terms.flatMap((t) => t.courses)), "unit")}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {terms.map(({ term, courses: termCourses }) => (
                      <TermTable
                        key={term}
                        term={term}
                        courses={termCourses}
                        codeOf={codeOf}
                        issuesByCourse={issuesByCourse}
                        onAdd={() => setDialog({ kind: "course", course: null, start: { year_level: year, term } })}
                        onEdit={(course) => setDialog({ kind: "course", course, start: lastPlace })}
                        onDelete={askDeleteCourse}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {dialog?.kind === "course" && currentId && (
        <CourseModal
          curriculumId={currentId}
          course={dialog.course}
          start={dialog.start}
          courses={courses}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void reload();
          }}
        />
      )}
      {dialog?.kind === "name" && (
        <NameModal
          curriculum={dialog.curriculum}
          onClose={() => setDialog(null)}
          onSaved={(id) => {
            setDialog(null);
            select(id);
            void reload();
          }}
        />
      )}
      {confirmation && (
        <ConfirmModal
          config={{
            title: confirmation.title,
            message: confirmation.message,
            confirmLabel: confirmation.confirmLabel,
            danger: confirmation.danger,
            loading: confirming,
            error: confirmError,
            onConfirm: () => void runConfirmation(),
          }}
          onClose={() => {
            setConfirmation(null);
            setConfirmError(null);
          }}
        />
      )}
    </div>
  );
}
