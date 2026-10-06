"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowDown,
  faArrowUp,
  faBookMedical,
  faChartColumn,
  faListCheck,
  faLock,
  faPenToSquare,
  faPlus,
  faTrashCan,
  faTriangleExclamation,
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
import {
  formatTermDates,
  inTopicOrder,
  requirementDetail,
  requirementNames,
  topicKey,
  type RequirementTopicKey,
} from "../../../lib/course-progress";
import RequirementModal from "./requirement-modal";
import { SkeletonProgressGrid } from "../../../components/skeletons";
import ProgressTab from "./progress-tab";
import CourseCrumbs from "./course-crumbs";
import CourseTabBar, { COURSE_TAB_PANEL_ID, courseTabId } from "./course-tab-bar";
import { courseTabHref, parseCourseTab, type CourseTab } from "../course-tabs";
import { TopicIcon, groupByTopic } from "../topics";

const NO_SKILLS: SkillSummary[] = [];

export default function FacultyCourseClient({ offeringId }: { offeringId: string }) {
  // The tab lives in the URL, so it can be linked to and Back returns to it.
  // replaceState keeps useSearchParams in step without a navigation.
  const tab = parseCourseTab(useSearchParams().get("tab"));
  const setTab = (next: CourseTab) => window.history.replaceState(null, "", courseTabHref(offeringId, next));
  const [editing, setEditing] = useState<CourseRequirement | null | "new">(null);
  // The section a new item was added from, which sets its starting kind.
  const [preset, setPreset] = useState<RequirementTopicKey | null>(null);
  const addRequirement = (topic: RequirementTopicKey | null = null) => {
    setPreset(topic);
    setEditing("new");
  };
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

  // Items move within their section. The saved order becomes the shown one
  // (grouped by topic), so the mobile app lists them the same way.
  const move = async (id: string, delta: -1 | 1) => {
    const next = inTopicOrder(requirements);
    const i = next.findIndex((r) => r.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= next.length || topicKey(next[i]) !== topicKey(next[j])) return;
    [next[i], next[j]] = [next[j], next[i]];
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
        <CourseCrumbs offeringId={offeringId} code={null} tab={tab} />
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          {loadError ?? "This course could not be found."}
        </div>
      </div>
    );
  }

  const noGroup = offering?.sections.filter((s) => !s.has_group) ?? [];

  return (
    <div>
      <CourseCrumbs offeringId={offeringId} code={offering?.course.code ?? null} tab={tab} />
      <PageHeader
        badge={{ icon: <FontAwesomeIcon icon={faBookMedical} className="h-3.5 w-3.5" />, label: offering?.term.name ?? "Course" }}
        title={offering ? `${offering.course.code} · ${offering.course.title}` : "Course"}
        subtitle={
          offering
            ? `${formatTermDates(offering.term)} · ${offering.sections.map((s) => s.name).join(", ")} · ${offering.student_count} student${offering.student_count === 1 ? "" : "s"}`
            : "Loading…"
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

      <CourseTabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "progress", label: "Progress", icon: faChartColumn, count: offering?.student_count ?? 0 },
          { id: "requirements", label: "Requirements", icon: faListCheck, count: requirements.length },
          { id: "skills", label: "Skills", icon: faBookMedical, count: detail?.skill_ids.length ?? 0 },
        ]}
        action={
          tab === "requirements"
            ? {
                icon: faPlus,
                text: "Add Requirement",
                label: locked ? "The term has ended, so the checklist is locked" : "Add a requirement to the checklist",
                onClick: () => addRequirement(),
                disabled: !offering || locked,
              }
            : tab === "skills"
              ? { icon: faPenToSquare, text: "Edit Skills", label: "Edit the course's skill list", onClick: () => setSkillsOpen(true), disabled: !offering }
              : undefined
        }
      />

      {/* Keyed by tab so its content fades in; opacity only, nothing moves. */}
      <div key={tab} id={COURSE_TAB_PANEL_ID} role="tabpanel" aria-labelledby={courseTabId(tab)} className="animate-fade-in">
        {tab === "progress" && !offering && loading && <SkeletonProgressGrid />}
        {tab === "progress" && offering && (
          <ProgressTab
            offeringId={offeringId}
            signature={checklistSignature(requirements)}
            onOpenRequirements={() => setTab("requirements")}
          />
        )}

        {tab === "requirements" &&
          (loading ? (
            <div className="space-y-4" aria-hidden>
              {[3, 2].map((rows, k) => (
                <div key={k} className="animate-pulse overflow-hidden rounded-xl border border-hairline bg-surface">
                  <div className="flex items-center gap-3 border-b border-hairline px-4 py-3">
                    <div className="h-8 w-8 rounded-lg bg-gray-100" />
                    <div className="space-y-1.5">
                      <div className="h-3.5 w-32 rounded bg-gray-200" />
                      <div className="h-3 w-44 rounded bg-gray-100" />
                    </div>
                  </div>
                  {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="space-y-2 border-b border-hairline px-4 py-3.5 last:border-b-0">
                      <div className="h-3.5 w-24 rounded bg-gray-100" />
                      <div className="h-3.5 w-72 rounded bg-gray-100" />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ) : requirements.length === 0 ? (
            <div className="rounded-xl border border-hairline bg-surface px-6 py-12 text-center">
              <FontAwesomeIcon icon={faListCheck} className="mb-3 h-7 w-7 text-gray-300" />
              <p className="font-semibold text-gray-700">No requirements yet</p>
              <p className="mx-auto mt-1 max-w-md text-sm text-gray-500">
                List what your students must accomplish this term, such as &ldquo;3 Patient Cases graded&rdquo; or a skill
                from the course. Automatic items are met once the work is graded; you score Lab Activities yourself.
              </p>
              {!locked && (
                <button
                  type="button"
                  onClick={() => addRequirement()}
                  className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                >
                  <FontAwesomeIcon icon={faPlus} className="h-3.5 w-3.5" />
                  Add the first requirement
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {groupByTopic(requirements).map(({ topic, items }) => (
                <section
                  key={topic.key}
                  aria-labelledby={`topic-${topic.key}`}
                  className="relative overflow-hidden rounded-xl border border-hairline bg-surface"
                >
                  <span className={`absolute inset-y-0 left-0 w-1 ${topic.bar}`} aria-hidden />
                  <header className="flex items-center gap-3 border-b border-hairline bg-subtle/60 py-3 pl-5 pr-3">
                    <TopicIcon topic={topic} />
                    <div className="min-w-0 flex-1">
                      <h3 id={`topic-${topic.key}`} className="flex items-center gap-2 font-display text-[15px] font-semibold text-gray-900">
                        {topic.label}
                        <span className="rounded-full bg-surface px-1.5 text-[11px] font-semibold text-gray-500 ring-1 ring-inset ring-hairline">
                          {items.length}
                        </span>
                      </h3>
                      <p className="text-xs text-gray-500">{topic.blurb}</p>
                    </div>
                    {!locked && (
                      <button
                        type="button"
                        onClick={() => addRequirement(topic.key)}
                        aria-label={`Add to ${topic.label}`}
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors hover:bg-surface ${topic.text}`}
                      >
                        <FontAwesomeIcon icon={faPlus} className="h-3 w-3" />
                        Add
                      </button>
                    )}
                  </header>
                  <ol className="divide-y divide-hairline">
                    {items.map(({ requirement: r, name }, i) => (
                      <RequirementRowView
                        key={r.id}
                        name={name}
                        requirement={r}
                        first={i === 0}
                        last={i === items.length - 1}
                        locked={locked}
                        onMove={(delta) => void move(r.id, delta)}
                        onEdit={() => setEditing(r)}
                        onRemove={() => setRemoving(r)}
                      />
                    ))}
                  </ol>
                </section>
              ))}
            </div>
          ))}

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

      </div>

      {editing && offering && (
        <RequirementModal
          offeringId={offeringId}
          requirement={editing === "new" ? null : editing}
          name={editing === "new" ? undefined : nameOf(editing.id)}
          preset={editing === "new" ? preset : null}
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
            message: `${nameOf(removing.id)} (${requirementDetail(removing)}) comes off the checklist, with any scores or marks you entered on it. Later items of the same kind are renumbered. Graded work is not touched.`,
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

function RequirementRowView({
  name,
  requirement: r,
  first,
  last,
  locked,
  onMove,
  onEdit,
  onRemove,
}: {
  name: string;
  requirement: CourseRequirement;
  first: boolean;
  last: boolean;
  locked: boolean;
  onMove: (delta: -1 | 1) => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-3 py-3 pl-5 pr-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800">{name}</p>
        <p className="text-sm text-gray-500">{requirementDetail(r)}</p>
        {r.removed && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">
            <FontAwesomeIcon icon={faTriangleExclamation} className="h-2.5 w-2.5" />
            The linked activity was deleted
          </span>
        )}
      </div>
      {!locked && (
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={first}
            aria-label={`Move ${name} up`}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30"
          >
            <FontAwesomeIcon icon={faArrowUp} className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={last}
            aria-label={`Move ${name} down`}
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
