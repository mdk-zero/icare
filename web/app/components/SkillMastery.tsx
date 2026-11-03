"use client";

import { useState, type ReactNode } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck } from "@fortawesome/free-solid-svg-icons";
import { fetchCohortMastery, fetchStudentSkillMastery } from "../lib/api";
import {
  MASTERY_THRESHOLD,
  MIN_FIT_ANSWERS,
  MIN_FIT_STUDENTS,
  countSources,
  type BktSource,
  type CohortMastery,
  type SkillMastery,
} from "../lib/bkt";
import { usePageData } from "../lib/use-page-data";

/**
 * Bayesian Knowledge Tracing on the portal's pages: one student's skills on
 * their profile, the class's skills on Analytics. The estimates come from
 * /api/analytics/skill-mastery, and they read a student's whole record of
 * quizzes, Patient Cases and Return Demonstrations, so a date range never
 * changes them.
 */

/** How many of the class's weakest skills show before "Show all". */
const COHORT_ROWS = 6;

const THRESHOLD_PCT = Math.round(MASTERY_THRESHOLD * 100);

/**
 * P(known) as a percentage. Never rounds up to the mastery line or to a
 * certainty the model can't reach: 94.6% is not yet mastered, and 99.9% isn't 100%.
 */
function masteryPercent(value: number): number {
  const pct = Math.round(value * 100);
  return Math.min(pct, value < MASTERY_THRESHOLD ? THRESHOLD_PCT - 1 : 99);
}

export function useStudentMastery(studentId: string | undefined) {
  return usePageData(studentId ? `skill-mastery:student:${studentId}` : null, () =>
    fetchStudentSkillMastery(studentId as string),
  );
}

export function useCohortMastery(sectionIds: readonly string[], courseId: string | null = null) {
  return usePageData(
    `skill-mastery:cohort:${courseId ?? ""}:${[...sectionIds].sort().join(",")}`,
    () => fetchCohortMastery(sectionIds, courseId),
    { keepPreviousData: true },
  );
}

/** A single-hue bar with a tick at the mastery line. */
function MasteryMeter({ value, label }: { value: number; label: string }) {
  const pct = masteryPercent(value);
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={`${pct}%`}
      className="relative h-2 rounded-full bg-gray-100"
    >
      <div className="h-full rounded-full bg-brand-600" style={{ width: `${pct}%` }} />
      <span
        aria-hidden
        className="absolute -inset-y-0.5 w-px bg-gray-500"
        style={{ left: `${THRESHOLD_PCT}%` }}
      />
    </div>
  );
}

function MasteryRow({
  skillId,
  title,
  value,
  mastered,
  detail,
}: {
  skillId: string;
  title: string;
  value: number;
  mastered: boolean;
  detail: string;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex items-start justify-between gap-3">
        <p className="min-w-0 text-sm font-medium leading-snug text-gray-900">
          <span className="mr-1.5 font-normal tabular-nums text-gray-500">{skillId}</span>
          {title}
        </p>
        <span className="shrink-0 text-sm font-semibold tabular-nums text-gray-900">{masteryPercent(value)}%</span>
      </div>
      <MasteryMeter value={value} label={`Skill ${skillId} mastery`} />
      <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
        {mastered && (
          <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
            <FontAwesomeIcon icon={faCircleCheck} className="h-3 w-3" />
            Mastered
          </span>
        )}
        {detail}
      </p>
    </div>
  );
}

/** What the tick means, for a list of meters. */
function MasteryKey() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-gray-500">
      <span aria-hidden className="h-3 w-px bg-gray-500" />
      {THRESHOLD_PCT}% = mastered
    </span>
  );
}

/** Says how far to trust the numbers: a cold-start skill is a rough estimate. */
function SourceNote({ skills }: { skills: readonly { source: BktSource }[] }) {
  const { fitted, chapter, default: cold } = countSources(skills);
  const fit = `A skill gets its own fit at ${MIN_FIT_STUDENTS} students and ${MIN_FIT_ANSWERS} results.`;
  const parts = [
    fitted > 0 && `${fitted} ${fitted === 1 ? "skill" : "skills"} fitted on ${fitted === 1 ? "its" : "their"} own results`,
    chapter > 0 && `${chapter} on a chapter's fit`,
    cold > 0 && `${cold} on the starting parameters`,
  ].filter(Boolean);
  const text =
    cold === skills.length
      ? `Rough estimates for now: every skill here is on the starting parameters. ${fit}`
      : `${parts.join(" · ")}.${cold > 0 || chapter > 0 ? ` ${fit}` : ""}`;
  return <p className="mt-4 border-t border-hairline pt-3 text-xs text-gray-400">{text}</p>;
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">{children}</div>;
}

function MeterSkeleton({ rows }: { rows: number }) {
  return (
    <div aria-hidden className="grid animate-pulse grid-cols-1 gap-x-8 gap-y-4 lg:grid-cols-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i}>
          <div className="mb-2 h-3.5 w-2/3 rounded bg-gray-100" />
          <div className="h-2 rounded-full bg-gray-100" />
        </div>
      ))}
    </div>
  );
}

/** One student's skills, weakest first, for the Skill Areas tab of their profile. */
export function StudentMasteryPanel({ skills, loading }: { skills: SkillMastery[] | null | undefined; loading: boolean }) {
  return (
    <section>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900">Skill Mastery (BKT)</h3>
          <p className="text-xs text-gray-500">
            Bayesian Knowledge Tracing: the chance this student knows each skill, updated after every quiz answer and
            every finished Patient Case or Return Demonstration. Weakest first, the order a review quiz follows.
          </p>
        </div>
        {skills && skills.length > 0 && <MasteryKey />}
      </div>
      {loading ? (
        <MeterSkeleton rows={4} />
      ) : !skills ? (
        <p className="py-4 text-center text-sm text-gray-400">Skill mastery couldn&apos;t be loaded. Refresh to try again.</p>
      ) : skills.length === 0 ? (
        <p className="py-4 text-center text-sm text-gray-400">
          No estimates yet. They start with this student&apos;s first result on a skill.
        </p>
      ) : (
        <>
          <Grid>
            {skills.map((s) => (
              <MasteryRow
                key={s.skill_id}
                skillId={s.skill_id}
                title={s.title}
                value={s.mastery}
                mastered={s.mastery >= MASTERY_THRESHOLD}
                detail={`${s.correct} of ${s.answers} ${s.answers === 1 ? "result" : "results"} good`}
              />
            ))}
          </Grid>
          <SourceNote skills={skills} />
        </>
      )}
    </section>
  );
}

/** A student's mastery in a line or two, for the prediction card beside the risk model. */
export function MasteryBrief({ skills, onOpen }: { skills: SkillMastery[] | null | undefined; onOpen: () => void }) {
  if (!skills || skills.length === 0) return null;
  const mastered = skills.filter((s) => s.mastery >= MASTERY_THRESHOLD).length;
  const weakest = skills[0];
  return (
    <div className="border-t border-hairline pt-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-gray-500">Skill Mastery (BKT)</span>
        <span className="text-sm font-medium tabular-nums text-gray-900">
          {mastered} of {skills.length} mastered
        </span>
      </div>
      {mastered < skills.length && (
        <button
          type="button"
          onClick={onOpen}
          className="mt-1 text-left text-xs font-medium text-brand-600 transition-colors hover:text-brand-700"
        >
          Weakest: Skill {weakest.skill_id} at {masteryPercent(weakest.mastery)}% →
        </button>
      )}
    </div>
  );
}

/** The class's skills, weakest first, for inside a card on Analytics. */
export function CohortMasteryBody({ data, loading }: { data: CohortMastery | null | undefined; loading: boolean }) {
  const [showAll, setShowAll] = useState(false);
  if (loading) return <MeterSkeleton rows={COHORT_ROWS} />;
  if (!data) {
    return <p className="py-8 text-center text-sm text-gray-400">Skill mastery couldn&apos;t be loaded. Refresh to try again.</p>;
  }
  if (data.skills.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-400">
        No estimates yet. They start with the first result on a skill.
      </p>
    );
  }
  const shown = showAll ? data.skills : data.skills.slice(0, COHORT_ROWS);
  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-sm text-gray-500">
          <span className="font-semibold tabular-nums text-gray-900">
            {data.students_traced} of {data.total_students}
          </span>{" "}
          {data.total_students === 1 ? "student" : "students"} traced, across{" "}
          <span className="font-semibold tabular-nums text-gray-900">{data.answers.toLocaleString()}</span>{" "}
          {data.answers === 1 ? "result" : "results"}
        </p>
        <MasteryKey />
      </div>
      <Grid>
        {shown.map((s) => (
          <MasteryRow
            key={s.skill_id}
            skillId={s.skill_id}
            title={s.title}
            value={s.average_mastery}
            mastered={s.mastered === s.students}
            detail={`${s.mastered} of ${s.students} ${s.students === 1 ? "student" : "students"} mastered · ${s.answers} ${s.answers === 1 ? "result" : "results"}`}
          />
        ))}
      </Grid>
      {data.skills.length > COHORT_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-4 text-sm font-medium text-brand-600 transition-colors hover:text-brand-700"
        >
          {showAll ? "Show the weakest only" : `Show all ${data.skills.length} skills`}
        </button>
      )}
      <SourceNote skills={data.skills} />
    </>
  );
}
