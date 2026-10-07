/**
 * Reading course_requirements across migration 067, which added
 * manual_type. Until 067 is applied the column is missing, and every query
 * naming it fails; these helpers retry without it so the course pages keep
 * working, with every manual item read as a Lab Activity. Pure — no server
 * imports — so the fallback can be checked without a database.
 */

import { EXAMS_NEED_MIGRATION } from './course-grading';
import type { RequirementInput, RequirementRow } from './course-progress';

const LEGACY_REQUIREMENT_COLUMNS =
  'id, offering_id, position, kind, title, activity_type, scenario_id, assessment_id, presentation_id, target_count, skill_id, min_score, skills_only';

/** Every course_requirements column a checklist item is read with. */
export const REQUIREMENT_COLUMNS = `${LEGACY_REQUIREMENT_COLUMNS}, manual_type`;

/** A feature whose migration isn't applied yet: the route answers 503 with this message. */
export class MigrationNeeded extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationNeeded';
  }
}

/** Before 067 a column it adds is missing (42703 from Postgres, PGRST204 from PostgREST). */
export function isMissingGradingSchema(error: { code?: string } | null | undefined): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204';
}

/**
 * Run a course_requirements query with REQUIREMENT_COLUMNS, and once more
 * without manual_type (`legacy`) when 067 isn't applied. Other errors are
 * thrown, code intact, for courseFailure.
 */
export async function requirementQuery<D>(
  run: (columns: string, legacy: boolean) => PromiseLike<{ data: D; error: { code?: string } | null }>,
): Promise<D> {
  const res = await run(REQUIREMENT_COLUMNS, false);
  if (!res.error) return res.data;
  if (!isMissingGradingSchema(res.error)) throw res.error;
  const legacy = await run(LEGACY_REQUIREMENT_COLUMNS, true);
  if (legacy.error) throw legacy.error;
  return legacy.data;
}

/** A row as the app uses it: numeric(5,2) can come back as a string, and before 067 there is no manual_type. */
export function normaliseRequirement(row: Record<string, unknown>): RequirementRow {
  const r = row as unknown as RequirementRow;
  return { ...r, min_score: r.min_score === null ? null : Number(r.min_score), manual_type: r.manual_type ?? 'lab' };
}

/**
 * A checklist item's fields as written to course_requirements: as they are
 * once 067 is applied, and without manual_type before it. A Written Exam
 * can't be saved before 067, since it would come back a Lab Activity.
 */
export function requirementWrite(value: RequirementInput, legacy: boolean): Record<string, unknown> {
  if (!legacy) return { ...value };
  if (value.manual_type === 'exam') throw new MigrationNeeded(EXAMS_NEED_MIGRATION);
  const { manual_type: _manualType, ...rest } = value;
  void _manualType;
  return rest;
}
