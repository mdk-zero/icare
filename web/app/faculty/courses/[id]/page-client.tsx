"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowLeft,
  faArrowUp,
  faBookMedical,
  faChartColumn,
  faListCheck,
  faLock,
  faPenToSquare,
  faPlus,
  faTrashCan,
  faTriangleExclamation,
  faUserCheck,
  faWandMagicSparkles,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../../components/PageHeader";
import ActionsMenu from "../../../components/ActionsMenu";
import ConfirmModal from "../../../components/ConfirmModal";
import CourseSkillsModal from "../../../components/CourseSkillsModal";
import { toast } from "../../../components/Toast";
import { usePageData } from "../../../lib/use-page-data";
import {
  deleteRequirement,
  fetchFacultyCourse,
  fetchSkillCatalog,
  reorderRequirements,
  saveCourseSkills,
  suggestCourseSkills,
  type CourseRequirement,
  type SkillSummary,
} from "../../../lib/api";
import { formatTermDates, requirementDetail, requirementNames } from "../../../lib/course-progress";
import RequirementModal from "./requirement-modal";
import { SkeletonProgressGrid } from "../../../components/skeletons";
import ProgressTab from "./progress-tab";

type Tab = "progress" | "requirements" | "skills";

const NO_SKILLS: SkillSummary[] = [];

export default function FacultyCourseClient({ offeringId }: { offeringId: string }) {
  const [tab, setTab] = useState<Tab>("progress");
  const [editing, setEditing] = useState<CourseRequirement | null | "new">(null);
  const [removing, setRemoving] = useState<CourseRequirement | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);

  const { data, loading, refresh, setData } = usePageData(`faculty:course:${offeringId}`, () => fetchFacultyCourse(offeringId));
  const { data: catalog = NO_SKILLS } = usePageData("skills:catalog", fetchSkillCatalog, { freshFor: 10 * 60_000 });

  const detail = data?.data ?? null;
  const loadError = data?.error ?? null;
  const offering = detail?.offering ?? null;
  const requirements = detail?.requirements ?? [];
  const locked = offering?.locked ?? false;
  const skillById = useMemo(() => new Map(catalog.map((s) => [s.id, s])), [catalog]);
  const names = requirementNames(requirements);
  const nameOf = (id: string) => names[requirements.findIndex((r) => r.id === id)] ?? "requirement";

  const move = async (index: number, delta: -1 | 1) => {
    const next = [...requirements];
    const [item] = next.splice(index, 1);
    next.splice(index + delta, 0, item);
    const ids = next.map((r) => r.id);
    setData((prev) => (prev?.data ? { data: { ...prev.data, requirements: next.map((r, position) => ({ ...r, position })) } } : prev!));
    const result = await reorderRequirements(offeringId, ids);
    if (result.error !== undefined) {
      toast(result.error, "error");
      await refresh();
    }
  };

  const confirmRemove = async () => {
    if (!removing) return;
    setRemoveBusy(true);
    const result = await deleteRequirement(offeringId, removing.id);
    setRemoveBusy(false);
    if (result.error !== undefined) {
      toast(result.error, "error");
      return;
    }
    setRemoving(null);
    toast("Requirement removed");
    await refresh();
  };

  const skillGroups = useMemo(() => {
    const groups = new Map<number, { area: string; skills: SkillSummary[] }>();
    for (const id of detail?.skill_ids ?? []) {
      const s = skillById.get(id);
      if (!s) continue;
      const g = groups.get(s.chapter) ?? { area: s.area, skills: [] };
      g.skills.push(s);
      groups.set(s.chapter, g);
    }
    return [...groups.entries()].sort((a, b) => a[0] - b[0]);
  }, [detail?.skill_ids, skillById]);

  if (!loading && !offering) {
    return (
      <div>
        <BackLink />
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          {loadError ?? "This course could not be found."}
        </div>
      </div>
    );
  }

  const noGroup = offering?.sections.filter((s) => !s.has_group) ?? [];

  return (
    <div>
      <BackLink />
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faBookMedical} className="h-3.5 w-3.5" />, label: offering?.term.name ?? "Course" }}
        title={offering ? `${offering.course.code} · ${offering.course.title}` : "Course"}
        subtitle={
          offering
            ? `${formatTermDates(offering.term)} · ${offering.sections.map((s) => s.name).join(", ")} · ${offering.student_count} student${offering.student_count === 1 ? "" : "s"}`
            : "Loading…"
        }
        action={
          tab === "progress"
            ? undefined
            : tab === "requirements"
            ? {
                icon: <FontAwesomeIcon icon={faPlus} className="h-4 w-4" />,
                onClick: () => setEditing("new"),
                label: locked ? "The term has ended, so the checklist is locked" : "Add a requirement to the checklist",
                text: "Add Requirement",
                disabled: !offering || locked,
              }
            : {
                icon: <FontAwesomeIcon icon={faPenToSquare} className="h-4 w-4" />,
                onClick: () => setSkillsOpen(true),
                label: "Edit the course's skill list",
                text: "Edit Skills",
                disabled: !offering,
              }
        }
      />

      {locked && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-hairline bg-subtle px-4 py-3 text-sm text-gray-600">
          <FontAwesomeIcon icon={faLock} className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
          This term has ended, so the checklist is locked. You can still enter scores.
        </div>
      )}
      {noGroup.length > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-4 w-4 shrink-0" />
          {`You supervise no group in ${noGroup.map((s) => s.name).join(", ")}, so no students come from ${noGroup.length === 1 ? "that section" : "those sections"}. Ask your Dean to assign you a group there.`}
        </div>
      )}

      <div
        role="tablist"
        aria-label="Course sections"
        className="mb-4 flex gap-1 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--color-hairline)]"
      >
        {(
          [
            { id: "progress", label: "Progress", icon: faChartColumn, count: offering?.student_count ?? 0 },
            { id: "requirements", label: "Requirements", icon: faListCheck, count: requirements.length },
            { id: "skills", label: "Skills", icon: faBookMedical, count: detail?.skill_ids.length ?? 0 },
          ] as const
        ).map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`flex shrink-0 items-center gap-2 border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                active ? "border-brand-600 text-brand-700" : "border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-800"
              }`}
            >
              <FontAwesomeIcon icon={t.icon} className="h-3.5 w-3.5" />
              {t.label}
              <span className="rounded-full bg-gray-100 px-1.5 text-[11px] font-semibold text-gray-500">{t.count}</span>
            </button>
          );
        })}
      </div>

      {tab === "progress" && !offering && loading && <SkeletonProgressGrid />}
      {tab === "progress" && offering && <ProgressTab offeringId={offeringId} signature={checklistSignature(requirements)} />}

      {tab === "requirements" && (
        <div className="overflow-hidden rounded-xl border border-hairline bg-surface">
          {loading ? (
            <ul className="divide-y divide-hairline" aria-hidden>
              {Array.from({ length: 4 }).map((_, i) => (
                <li key={i} className="animate-pulse space-y-2 px-4 py-4">
                  <div className="h-4 w-28 rounded bg-gray-100" />
                  <div className="h-4 w-72 rounded bg-gray-100" />
                </li>
              ))}
            </ul>
          ) : requirements.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <FontAwesomeIcon icon={faListCheck} className="mb-3 h-7 w-7 text-gray-300" />
              <p className="font-semibold text-gray-700">No requirements yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                List what your students must accomplish this term, such as &ldquo;3 Patient Cases graded&rdquo; or a skill
                from the course. Automatic items tick themselves once the work is graded.
              </p>
            </div>
          ) : (
            <ol className="divide-y divide-hairline">
              {requirements.map((r, i) => (
                <RequirementRowView
                  key={r.id}
                  index={i}
                  name={names[i]}
                  requirement={r}
                  last={i === requirements.length - 1}
                  locked={locked}
                  onMove={(delta) => void move(i, delta)}
                  onEdit={() => setEditing(r)}
                  onRemove={() => setRemoving(r)}
                />
              ))}
            </ol>
          )}
        </div>
      )}

      {tab === "skills" && (
        <div className="rounded-xl border border-hairline bg-surface p-4">
          <p className="mb-3 text-sm text-gray-500">
            The skills from the catalog this course covers. The list is shared with your Dean and every instructor teaching{" "}
            {offering?.course.code ?? "the course"}; skill requirements choose from it.
          </p>
          {skillGroups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 px-6 py-10 text-center">
              <FontAwesomeIcon icon={faWandMagicSparkles} className="mb-3 h-7 w-7 text-gray-300" />
              <p className="font-semibold text-gray-700">No skills picked yet</p>
              <p className="mt-1 text-sm text-gray-500">Use Edit Skills to pick them, or let Detect with AI suggest them from the course description.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {skillGroups.map(([chapter, g]) => (
                <section key={chapter}>
                  <h3 className="mb-1.5 text-sm font-semibold text-gray-800">
                    Chapter {chapter} · {g.area}
                  </h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {g.skills.map((s) => (
                      <li key={s.id} className="rounded-lg bg-brand-600/10 px-2.5 py-1 text-xs text-brand-800">
                        <span className="font-mono">{s.id}</span> {s.title}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </div>
      )}

      {editing && offering && (
        <RequirementModal
          offeringId={offeringId}
          requirement={editing === "new" ? null : editing}
          name={editing === "new" ? undefined : nameOf(editing.id)}
          courseSkillIds={detail?.skill_ids ?? []}
          catalog={catalog}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}
      {removing && (
        <ConfirmModal
          config={{
            title: "Remove this requirement?",
            message: `${nameOf(removing.id)} (${requirementDetail(removing)}) comes off the checklist${removing.kind === "manual" ? ", with any ticks you gave on it" : ""}. Later items of the same kind are renumbered. Graded work is not touched.`,
            confirmLabel: "Remove",
            loading: removeBusy,
            onConfirm: () => void confirmRemove(),
          }}
          onClose={() => setRemoving(null)}
        />
      )}
      {skillsOpen && offering && (
        <CourseSkillsModal
          course={offering.course}
          initial={detail?.skill_ids ?? []}
          onSuggest={() => suggestCourseSkills(offeringId)}
          onSave={(ids, aiIds) => saveCourseSkills(offeringId, ids, aiIds)}
          onClose={() => setSkillsOpen(false)}
          onSaved={async () => {
            setSkillsOpen(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

/**
 * Changes whenever the checklist does, so the Progress tab refetches after an
 * edit instead of showing the columns it cached a moment ago.
 */
function checklistSignature(requirements: CourseRequirement[]): string {
  let hash = 5381;
  // The label is derived from the rest, so the item fields are enough.
  const fields = requirements.map((r) => [r.id, r.position, r.kind, r.activity_type, r.scenario_id, r.assessment_id, r.presentation_id, r.target_count, r.skill_id, r.min_score, r.skills_only]);
  for (const ch of JSON.stringify(fields)) hash = ((hash << 5) + hash + ch.charCodeAt(0)) | 0;
  return String(hash >>> 0);
}

function BackLink() {
  return (
    <Link href="/faculty/courses" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-brand-700 hover:underline">
      <FontAwesomeIcon icon={faArrowLeft} className="h-3 w-3" />
      All courses
    </Link>
  );
}

function RequirementRowView({
  index,
  name,
  requirement: r,
  last,
  locked,
  onMove,
  onEdit,
  onRemove,
}: {
  index: number;
  name: string;
  requirement: CourseRequirement;
  last: boolean;
  locked: boolean;
  onMove: (delta: -1 | 1) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const manual = r.kind === "manual";
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800">{name}</p>
        <p className="text-sm text-gray-500">{requirementDetail(r)}</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              manual ? "bg-violet-50 text-violet-700" : "bg-brand-600/10 text-brand-700"
            }`}
          >
            <FontAwesomeIcon icon={manual ? faUserCheck : faListCheck} className="h-2.5 w-2.5" />
            {manual ? "You tick it" : "Ticks when graded"}
          </span>
          {r.removed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5" />
              The linked activity was deleted
            </span>
          )}
        </div>
      </div>
      {!locked && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={index === 0}
            aria-label="Move up"
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
          >
            <FontAwesomeIcon icon={faArrowUp} className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={last}
            aria-label="Move down"
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
          >
            <FontAwesomeIcon icon={faArrowDown} className="h-3.5 w-3.5" />
          </button>
          <ActionsMenu
            variant="compact"
            label={`Actions for ${name}`}
            actions={[
              { label: "Edit", icon: faPenToSquare, onClick: onEdit },
              { label: "Remove", icon: faTrashCan, danger: true, onClick: onRemove },
            ]}
          />
        </div>
      )}
    </li>
  );
}

