"use client";

import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";
import {
  faClipboardCheck,
  faFilePen,
  faHashtag,
  faListCheck,
  faPenToSquare,
  faTriangleExclamation,
  faFlask,
  faXmark,
} from "@fortawesome/free-solid-svg-icons";
import {
  addRequirement,
  fetchCourseActivities,
  updateRequirement,
  type CourseActivities,
  type CourseRequirement,
  type SkillSummary,
} from "../../../lib/api";
import {
  MAX_REQUIREMENT_TITLE,
  MAX_TARGET_COUNT,
  SKILL_LEVELS,
  parseRequirement,
  requirementLabel,
  type ActivityType,
  type ManualType,
  type RequirementKind,
  type RequirementTopicKey,
} from "../../../lib/course-progress";
import { gradingLeaves, isGradeable, leafOf, type GradingSplit } from "../../../lib/course-grading";
import { PASSING_SCORE } from "../../../lib/reports/data";
import { EcgLoader } from "../../../components/EcgLoader";
import { loadingToast } from "../../../components/Toast";

/** Manual items come as two cards, told apart by manualType. */
const KINDS: { kind: RequirementKind; manualType?: ManualType; label: string; hint: string; icon: IconDefinition }[] = [
  { kind: "activity", label: "Specific activity", hint: "One Patient Case, Quiz or Case Presentation", icon: faClipboardCheck },
  { kind: "count", label: "Count", hint: "A number of graded activities, or shifts attended", icon: faHashtag },
  { kind: "skill", label: "Skill", hint: "Graded work covering one of the course's skills", icon: faListCheck },
  {
    kind: "manual",
    manualType: "lab",
    label: "Lab Activity",
    hint: "Hands-on work, like a return demonstration; you enter each score",
    icon: faFlask,
  },
  { kind: "manual", manualType: "exam", label: "Written Exam", hint: "A paper exam; you enter each score", icon: faFilePen },
];

const ACTIVITY_TYPES: { type: Exclude<ActivityType, "shift">; label: string }[] = [
  { type: "scenario", label: "Patient Case" },
  { type: "assessment", label: "Quiz" },
  { type: "case_presentation", label: "Case Presentation" },
];

const COUNT_TYPES: { type: ActivityType; label: string }[] = [
  { type: "scenario", label: "Patient Cases graded" },
  { type: "assessment", label: "Quizzes completed" },
  { type: "case_presentation", label: "Case Presentations graded" },
  { type: "shift", label: "Shifts attended" },
];

const inputClass =
  "w-full rounded-xl border border-gray-300 bg-surface px-3.5 py-2.5 text-sm text-gray-900 transition-all placeholder:text-gray-400 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/30 disabled:opacity-60";
const labelClass = "mb-1.5 block text-sm font-semibold text-gray-700";

/** The score box's text: "" for none. */
const scoreText = (n: number | null) => (n === null ? "" : String(n));

export default function RequirementModal({
  offeringId,
  requirement,
  name,
  preset,
  presetSkillId,
  courseSkillIds,
  catalog,
  grading,
  onClose,
  onSaved,
}: {
  offeringId: string;
  /** null: a new item. */
  requirement: CourseRequirement | null;
  /** The item's "Quiz #2" name (requirementNames), when editing. */
  name?: string;
  /** A new item's starting kind, from the section it was added from. */
  preset?: RequirementTopicKey | null;
  /** A new Skill item's skill, when added from the Skills tab. */
  presetSkillId?: string | null;
  courseSkillIds: string[];
  catalog: SkillSummary[];
  /** The course's grading split, for "Counts toward"; null hides it. */
  grading: GradingSplit | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [kind, setKind] = useState<RequirementKind>(
    requirement?.kind ?? (preset === "skill" || preset === "manual" ? preset : preset === "exam" ? "manual" : "count"),
  );
  const [manualType, setManualType] = useState<ManualType>(requirement?.manual_type ?? (preset === "exam" ? "exam" : "lab"));
  const [title, setTitle] = useState(requirement?.title ?? "");
  const [activityType, setActivityType] = useState<ActivityType>(
    requirement?.activity_type ??
      (preset && preset !== "skill" && preset !== "manual" && preset !== "exam" ? preset : "scenario"),
  );
  const [activityId, setActivityId] = useState(
    requirement?.scenario_id ?? requirement?.assessment_id ?? requirement?.presentation_id ?? "",
  );
  const [targetCount, setTargetCount] = useState(String(requirement?.target_count ?? 3));
  const [minScore, setMinScore] = useState(scoreText(requirement?.min_score ?? null));
  const [skillsOnly, setSkillsOnly] = useState(requirement?.skills_only ?? false);
  const [skillId, setSkillId] = useState(requirement?.skill_id ?? presetSkillId ?? "");
  const [skillLevel, setSkillLevel] = useState<number | null>(requirement ? requirement.min_score : 50);
  const [leafId, setLeafId] = useState(requirement ? leafOf(grading, requirement.id) ?? "" : "");
  const [activities, setActivities] = useState<CourseActivities | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void fetchCourseActivities(offeringId).then((result) => {
      if (!live) return;
      if (result.error !== undefined) setError(result.error);
      else setActivities(result.data);
    });
    return () => {
      live = false;
    };
  }, [offeringId]);

  const skillTitle = useMemo(() => new Map(catalog.map((s) => [s.id, s])), [catalog]);
  const courseSkills = useMemo(
    () => courseSkillIds.map((id) => skillTitle.get(id)).filter((s): s is SkillSummary => !!s),
    [courseSkillIds, skillTitle],
  );

  /** Switching to a Quiz defaults the bar to the College's pass mark; elsewhere it clears. */
  const pickType = (type: ActivityType) => {
    setActivityType(type);
    setActivityId("");
    setMinScore(type === "assessment" ? String(PASSING_SCORE) : "");
  };

  const pickKind = (next: RequirementKind) => {
    setKind(next);
    setError(null);
    if (next === "count" && activityType === "assessment" && minScore === "") setMinScore(String(PASSING_SCORE));
    if (next === "activity" && activityType === "shift") pickType("scenario");
  };

  const link = { scenario: "scenario_id", assessment: "assessment_id", case_presentation: "presentation_id", shift: null }[activityType];
  const body: Record<string, unknown> = {
    kind,
    title,
    activity_type: activityType,
    target_count: Number(targetCount),
    min_score: kind === "skill" ? skillLevel : minScore === "" ? null : Number(minScore),
    skills_only: skillsOnly,
    skill_id: skillId,
    manual_type: manualType,
    ...(link ? { [link]: activityId } : {}),
  };
  const parsed = parseRequirement(body);
  const leaves = gradingLeaves(grading);
  // Attendance has no score, so it never counts toward the grade.
  const showLeaf = leaves.length > 0 && isGradeable({ kind, activity_type: activityType });

  const options =
    activityType === "scenario"
      ? activities?.scenarios ?? []
      : activityType === "assessment"
        ? activities?.quizzes ?? []
        : activityType === "case_presentation"
          ? activities?.presentations ?? []
          : [];
  const pickedScenario = activityType === "scenario" ? activities?.scenarios.find((s) => s.id === activityId) : undefined;

  const preview = parsed.ok
    ? requirementLabel(
        { ...parsed.value, id: "", offering_id: offeringId, position: 0 },
        {
          scenarios: Object.fromEntries((activities?.scenarios ?? []).map((s) => [s.id, s.title])),
          quizzes: Object.fromEntries((activities?.quizzes ?? []).map((s) => [s.id, s.title])),
          presentations: Object.fromEntries((activities?.presentations ?? []).map((s) => [s.id, s.title])),
          skills: Object.fromEntries(catalog.map((s) => [s.id, s.title])),
        },
      )
    : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setSaving(true);
    setError(null);
    const progress = loadingToast(requirement ? "Saving requirement…" : "Adding requirement…");
    const input = showLeaf ? { ...parsed.value, grade_leaf_id: leafId || null } : parsed.value;
    const result = requirement
      ? await updateRequirement(offeringId, requirement.id, input)
      : await addRequirement(offeringId, input);
    setSaving(false);
    if (result.error !== undefined) {
      progress.error(result.error);
      setError(result.error);
      return;
    }
    progress.success(requirement ? "Requirement saved" : "Requirement added");
    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={saving ? undefined : onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-hairline bg-surface shadow-[0_8px_30px_rgba(0,0,0,0.12)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-hairline bg-subtle px-5 py-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-600/10">
              <FontAwesomeIcon icon={requirement ? faPenToSquare : faListCheck} className="h-5 w-5 text-brand-600" />
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold text-gray-900">
                {requirement ? `Edit ${name ?? "requirement"}` : "Add a requirement"}
              </h2>
              <p className="text-sm text-gray-500">Automatic items tick themselves once the work is graded</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 disabled:opacity-40"
            aria-label="Close"
          >
            <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 overflow-y-auto p-5">
          <fieldset>
            <legend className={labelClass}>Kind</legend>
            <div className="grid grid-cols-2 gap-2">
              {KINDS.map((k, i) => {
                const active = kind === k.kind && (k.kind !== "manual" || manualType === k.manualType);
                // An odd card out spans the row rather than leaving a gap.
                const alone = i === KINDS.length - 1 && KINDS.length % 2 === 1;
                return (
                  <button
                    key={`${k.kind}:${k.manualType ?? ""}`}
                    type="button"
                    onClick={() => {
                      pickKind(k.kind);
                      if (k.manualType) setManualType(k.manualType);
                    }}
                    aria-pressed={active}
                    disabled={saving}
                    className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${alone ? "col-span-2" : ""} ${
                      active ? "border-brand-600 bg-brand-600/5" : "border-hairline hover:border-gray-300 hover:bg-subtle"
                    }`}
                  >
                    <FontAwesomeIcon icon={k.icon} className={`mt-0.5 h-4 w-4 shrink-0 ${active ? "text-brand-600" : "text-gray-400"}`} />
                    <span>
                      <span className="block text-sm font-semibold text-gray-800">{k.label}</span>
                      <span className="block text-xs text-gray-500">{k.hint}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {kind === "activity" && (
            <>
              <div className="flex gap-1 rounded-xl bg-subtle p-1" role="radiogroup" aria-label="Activity type">
                {ACTIVITY_TYPES.map((t) => (
                  <button
                    key={t.type}
                    type="button"
                    role="radio"
                    aria-checked={activityType === t.type}
                    onClick={() => pickType(t.type)}
                    className={`flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors ${
                      activityType === t.type ? "bg-surface text-brand-700 shadow-sm" : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <div>
                <label htmlFor="req-activity" className={labelClass}>
                  {ACTIVITY_TYPES.find((t) => t.type === activityType)?.label ?? "Activity"}
                </label>
                <select
                  id="req-activity"
                  value={activityId}
                  onChange={(e) => setActivityId(e.target.value)}
                  disabled={saving || activities === null}
                  className={inputClass}
                >
                  <option value="">{activities === null ? "Loading…" : options.length === 0 ? "None available" : "Choose one"}</option>
                  {options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.title}
                    </option>
                  ))}
                </select>
                {pickedScenario && pickedScenario.completed_before_term > 0 && (
                  <p className="mt-1.5 flex items-start gap-1.5 text-xs text-amber-700">
                    <FontAwesomeIcon icon={faTriangleExclamation} className="mt-0.5 h-3 w-3 shrink-0" />
                    {`${pickedScenario.completed_before_term} of your students in this course finished this case before the term began. A student does each case once, so it can't count for them this term.`}
                  </p>
                )}
              </div>
              <ScoreField value={minScore} onChange={setMinScore} disabled={saving} />
            </>
          )}

          {kind === "count" && (
            <>
              <div className="grid grid-cols-[6rem_1fr] gap-3">
                <div>
                  <label htmlFor="req-count" className={labelClass}>
                    How many
                  </label>
                  <input
                    id="req-count"
                    type="number"
                    min={1}
                    max={MAX_TARGET_COUNT}
                    value={targetCount}
                    onChange={(e) => setTargetCount(e.target.value)}
                    disabled={saving}
                    className={inputClass}
                  />
                </div>
                <div>
                  <label htmlFor="req-count-type" className={labelClass}>
                    Of
                  </label>
                  <select
                    id="req-count-type"
                    value={activityType}
                    onChange={(e) => pickType(e.target.value as ActivityType)}
                    disabled={saving}
                    className={inputClass}
                  >
                    {COUNT_TYPES.map((t) => (
                      <option key={t.type} value={t.type}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {activityType !== "shift" && <ScoreField value={minScore} onChange={setMinScore} disabled={saving} />}
              {(activityType === "scenario" || activityType === "assessment") && (
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={skillsOnly}
                    onChange={(e) => setSkillsOnly(e.target.checked)}
                    disabled={saving}
                    className="mt-0.5 h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-600/30"
                  />
                  <span>
                    Only count work covering this course&rsquo;s skills
                    <span className="block text-xs text-gray-500">
                      Leave off to count every {activityType === "scenario" ? "Patient Case" : "Quiz"} graded this term.
                    </span>
                  </span>
                </label>
              )}
            </>
          )}

          {kind === "skill" && (
            <>
              <div>
                <label htmlFor="req-skill" className={labelClass}>
                  Skill
                </label>
                <select
                  id="req-skill"
                  value={skillId}
                  onChange={(e) => setSkillId(e.target.value)}
                  disabled={saving || courseSkills.length === 0}
                  className={inputClass}
                >
                  <option value="">{courseSkills.length === 0 ? "The course has no skills yet" : "Choose a skill"}</option>
                  {courseSkills.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} · {s.title}
                    </option>
                  ))}
                </select>
                {courseSkills.length === 0 && (
                  <p className="mt-1.5 text-xs text-gray-500">Add skills on the Skills tab first.</p>
                )}
              </div>
              <div>
                <label htmlFor="req-level" className={labelClass}>
                  Counts when graded
                </label>
                <select
                  id="req-level"
                  value={skillLevel === null ? "" : String(skillLevel)}
                  onChange={(e) => setSkillLevel(e.target.value === "" ? null : Number(e.target.value))}
                  disabled={saving}
                  className={inputClass}
                >
                  {SKILL_LEVELS.map((l) => (
                    <option key={l.label} value={l.value === null ? "" : String(l.value)}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-xs text-gray-500">
                  Met by a graded Patient Case task or Quiz on this skill, inside the term.
                </p>
              </div>
            </>
          )}

          <div>
            <label htmlFor="req-title" className={labelClass}>
              {kind === "manual" ? (
                <>
                  Requirement <span className="text-rose-500">*</span>
                </>
              ) : (
                "Label (optional)"
              )}
            </label>
            <input
              id="req-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={MAX_REQUIREMENT_TITLE}
              disabled={saving}
              placeholder={
                kind !== "manual"
                  ? "Shown before the automatic description"
                  : manualType === "exam"
                    ? "Midterm written exam"
                    : "Submit the signed return-demonstration sheet"
              }
              className={inputClass}
            />
          </div>

          {showLeaf && (
            <div>
              <label htmlFor="req-leaf" className={labelClass}>
                Counts toward
              </label>
              <select
                id="req-leaf"
                value={leafId}
                onChange={(e) => setLeafId(e.target.value)}
                disabled={saving}
                className={inputClass}
              >
                <option value="">Not counted in the grade</option>
                {leaves.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          {preview && (
            <p className="rounded-lg border border-hairline bg-subtle p-2.5 text-sm text-gray-700">
              <span className="mr-1.5 text-xs font-semibold uppercase tracking-wider text-gray-400">Checklist shows</span>
              {title && kind !== "manual" ? `${title} — ` : ""}
              {preview}
            </p>
          )}

          {error && <p className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-sm text-rose-700">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-gray-200 bg-surface px-5 py-2.5 text-sm font-medium text-gray-700 transition-all hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !parsed.ok}
              className="flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white shadow-[0_2px_8px_-1px_rgb(27_107_123_/_0.35)] transition-all hover:bg-brand-700 disabled:opacity-60"
            >
              {saving && <EcgLoader />}
              {requirement ? "Save requirement" : "Add requirement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ScoreField({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled: boolean }) {
  return (
    <div>
      <label htmlFor="req-score" className={labelClass}>
        Minimum score (optional)
      </label>
      <div className="flex items-center gap-2">
        <input
          id="req-score"
          type="number"
          min={0}
          max={100}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder="Any"
          className={`${inputClass} w-28`}
        />
        <span className="text-sm text-gray-500">%</span>
        <span className="text-xs text-gray-500">Leave empty: graded is enough.</span>
      </div>
    </div>
  );
}
