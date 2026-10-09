"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faBookMedical,
  faChartColumn,
  faChartLine,
  faLock,
  faPenToSquare,
  faPercent,
  faTriangleExclamation,
} from "@fortawesome/free-solid-svg-icons";
import PageHeader from "../../../components/PageHeader";
import ConfirmModal from "../../../components/ConfirmModal";
import CourseSkillsModal from "../../../components/CourseSkillsModal";
import { toast } from "../../../components/Toast";
import { usePageData } from "../../../lib/use-page-data";
import {
  autoPickCourseSkills,
  deleteRequirement,
  fetchFacultyCourse,
  fetchSkillCatalog,
  saveCourseSkills,
  suggestCourseSkills,
  type CourseRequirement,
  type SkillSummary,
} from "../../../lib/api";
import {
  requirementDetail,
  requirementNames,
  type RequirementTopicKey,
} from "../../../lib/course-progress";
import RequirementModal from "./requirement-modal";
import { SkeletonProgressGrid } from "../../../components/skeletons";
import ProgressTab from "./progress-tab";
import PerformanceTab from "./performance-tab";
import CourseCrumbs from "./course-crumbs";
import CourseTabBar, { COURSE_TAB_PANEL_ID, courseTabId } from "./course-tab-bar";
import { ChecklistSkeleton } from "./checklist-section";
import SkillsTab from "./skills-tab";
import GradingTab from "./grading-tab";
import { afterItemSaved, followServer, isDirty, startDraft } from "../grading-draft";
import { courseTabHref, parseCourseTab, type CourseTab } from "../course-tabs";

const NO_SKILLS: SkillSummary[] = [];

export default function FacultyCourseClient({ offeringId }: { offeringId: string }) {
  // The tab lives in the URL, so it can be linked to and Back returns to it.
  // replaceState keeps useSearchParams in step without a navigation.
  const tab = parseCourseTab(useSearchParams().get("tab"));
  const setTab = (next: CourseTab) =>
    window.history.replaceState(null, "", courseTabHref(offeringId, next));
  const [editing, setEditing] = useState<CourseRequirement | null | "new">(null);
  // Where a new item was added from: a section sets its starting kind, a
  // grading component what it counts toward.
  const [preset, setPreset] = useState<{
    topic: RequirementTopicKey | null;
    skillId: string | null;
    leafId: string | null;
  }>({ topic: null, skillId: null, leafId: null });
  const addRequirement = (
    topic: RequirementTopicKey | null = null,
    skillId: string | null = null,
    leafId: string | null = null,
  ) => {
    setPreset({ topic, skillId, leafId });
    setEditing("new");
  };
  const [removing, setRemoving] = useState<CourseRequirement | null>(null);
  const [removeBusy, setRemoveBusy] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);

  const { data, loading, refresh } = usePageData(`faculty:course:${offeringId}`, () =>
    fetchFacultyCourse(offeringId),
  );
  const { data: catalog = NO_SKILLS } = usePageData("skills:catalog", fetchSkillCatalog, {
    freshFor: 10 * 60_000,
  });

  const detail = data?.data ?? null;
  const loadError = data?.error ?? null;
  const offering = detail?.offering ?? null;
  const requirements = detail?.requirements ?? [];
  // The Grading tab's unsaved edits live here, so looking at another tab
  // doesn't throw them away. They follow the server's split while clean.
  const serverGrading = detail?.grading ?? null;
  const [gradingDraft, setGradingDraft] = useState(() => startDraft(serverGrading));
  const followed = followServer(gradingDraft, serverGrading);
  if (followed !== gradingDraft) setGradingDraft(followed);
  const locked = offering?.locked ?? false;
  // An instructor with no skills picked yet gets the system's pick: the AI
  // reads the course and saves the skills it covers to their own list. The
  // server runs it once per assignment, so a list cleared on purpose stays
  // cleared.
  const needsPick = !!detail && !locked && detail.skill_ids.length === 0;
  const { loading: autoPicking } = usePageData(
    needsPick ? `faculty:course-autopick:${offeringId}` : null,
    async () => {
      const result = await autoPickCourseSkills(offeringId);
      const picked = result.data?.picked?.skill_ids.length ?? 0;
      if (picked > 0) {
        toast(`The AI picked ${picked} skill${picked === 1 ? "" : "s"} for ${detail?.offering.course.code ?? "this course"}`);
        await refresh();
      }
      return result;
    },
    { freshFor: 24 * 60 * 60_000 },
  );
  const names = requirementNames(requirements);
  const nameOf = (id: string) => names[requirements.findIndex((r) => r.id === id)] ?? "requirement";

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
        badge={{
          icon: <FontAwesomeIcon icon={faBookMedical} className="h-3.5 w-3.5" />,
          label: offering?.term.name ?? "Course",
        }}
        title={offering ? `${offering.course.code} · ${offering.course.title}` : "Course"}
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
          {
            id: "grading",
            label: "Criteria for Assessment",
            icon: faPercent,
            count: requirements.length,
          },
          {
            id: "progress",
            label: "Progress",
            icon: faChartColumn,
            count: offering?.student_count ?? 0,
          },
          {
            id: "performance",
            label: "Performance",
            icon: faChartLine,
            count: detail?.grading?.parts.length ?? 0,
          },
          {
            id: "skills",
            label: "Skills",
            icon: faBookMedical,
            count: detail?.skill_ids.length ?? 0,
          },
        ]}
        action={
          // Grading adds items inside each component ("New item"), so it needs no header button.
          tab === "skills"
            ? {
                icon: faPenToSquare,
                text: "Edit Skills",
                label: "Edit the course's skill list",
                onClick: () => setSkillsOpen(true),
                disabled: !offering,
              }
            : undefined
        }
      />

      {/* Keyed by tab so its content fades in; opacity only, nothing moves. */}
      <div
        key={tab}
        id={COURSE_TAB_PANEL_ID}
        role="tabpanel"
        aria-labelledby={courseTabId(tab)}
        className="animate-fade-in"
      >
        {tab === "progress" && !offering && loading && <SkeletonProgressGrid />}
        {tab === "progress" && offering && (
          <ProgressTab
            offeringId={offeringId}
            signature={checklistSignature(requirements)}
            onOpenGrading={() => setTab("grading")}
          />
        )}

        {tab === "performance" && !offering && loading && <SkeletonProgressGrid />}
        {tab === "performance" && offering && (
          <PerformanceTab
            offeringId={offeringId}
            signature={checklistSignature(requirements)}
            onOpenGrading={() => setTab("grading")}
          />
        )}

        {tab === "grading" && !offering && loading && <ChecklistSkeleton />}
        {tab === "grading" && offering && detail && (
          <GradingTab
            offeringId={offeringId}
            requirements={requirements}
            grading={detail.grading ?? null}
            gradingReady={detail.grading_ready ?? false}
            locked={locked}
            state={gradingDraft}
            onChange={setGradingDraft}
            onSaved={refresh}
            onNewItem={(leafId) => addRequirement(null, null, leafId)}
            onEditItem={setEditing}
            onRemoveItem={setRemoving}
          />
        )}

        {tab === "skills" && offering && (
          <SkillsTab
            courseCode={offering.course.code}
            skillIds={detail?.skill_ids ?? []}
            aiSkillIds={detail?.ai_skill_ids ?? []}
            catalog={catalog}
            picking={autoPicking}
            onEditSkills={() => setSkillsOpen(true)}
          />
        )}
      </div>

      {editing && offering && (
        <RequirementModal
          offeringId={offeringId}
          requirement={editing === "new" ? null : editing}
          name={editing === "new" ? undefined : nameOf(editing.id)}
          preset={editing === "new" ? preset.topic : null}
          presetSkillId={editing === "new" ? preset.skillId : null}
          courseSkillIds={detail?.skill_ids ?? []}
          catalog={catalog}
          grading={gradingDraft.draft}
          leafId={editing === "new" ? preset.leafId : undefined}
          fileLocally={isDirty(gradingDraft)}
          onClose={() => setEditing(null)}
          onSaved={async (saved, leafId) => {
            setEditing(null);
            setGradingDraft((s) => afterItemSaved(s, saved, leafId));
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
          aiPicked={detail?.ai_skill_ids ?? []}
          own
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
  const fields = requirements.map((r) => [
    r.id,
    r.position,
    r.kind,
    r.activity_type,
    r.scenario_id,
    r.assessment_id,
    r.presentation_id,
    r.target_count,
    r.skill_id,
    r.min_score,
    r.skills_only,
  ]);
  for (const ch of JSON.stringify(fields)) hash = ((hash << 5) + hash + ch.charCodeAt(0)) | 0;
  return String(hash >>> 0);
}
