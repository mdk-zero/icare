import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from './supabase/server';
import { isMissingColumn } from './auth/live-user';
import type { SessionPayload } from './auth/jwt';
import { isMissingCourseSchema, must, requireRole } from './courses';
import {
  EMPTY_ANALYSIS,
  catalogOf,
  inCurriculumOrder,
  requisiteRows,
  type CatalogCourse,
  type CurriculumAnalysis,
  type CurriculumCourseRow,
  type ImportedCourse,
} from './curriculum';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * Server side of the curriculum (migration 089). A curriculum belongs to a
 * Dean, and a Program Chair works on their Dean's, so both reach the same one:
 * that is why these routes go by `ownerId` rather than the caller's own id.
 */

export const CURRICULUM_BUCKET = 'curricula';
export const CURRICULUM_NEEDS_MIGRATION = 'The curriculum needs database migration 089 (curriculum) applied first.';

export const CURRICULUM_COLUMNS = 'id, name, is_active, source_name, source_path, analysis, created_at';
const COURSE_COLUMNS = 'id, code, title, year_level, term, lecture_units, lab_units, requisite_note, position';

export interface CurriculumRow {
  id: string;
  name: string;
  is_active: boolean;
  source_name: string | null;
  source_path: string | null;
  analysis: CurriculumAnalysis | null;
  created_at: string;
}

/** The 503 before migration 089, otherwise a logged 500. */
export function curriculumFailure(err: unknown, message: string): NextResponse {
  if (isMissingCourseSchema(err)) return NextResponse.json({ error: CURRICULUM_NEEDS_MIGRATION }, { status: 503 });
  console.error(message, err);
  return NextResponse.json({ error: message }, { status: 500 });
}

/** Whose curriculum the caller works on: their own, or for a Program Chair with a Dean, the Dean's. */
export async function curriculumOwnerId(supabase: Supabase, session: SessionPayload): Promise<string> {
  const { data, error } = await supabase
    .from('users')
    .select('admin_title, admin_id')
    .eq('id', session.uid)
    .maybeSingle();
  if (error) {
    // Before 080 there are no Program Chairs.
    if (isMissingColumn(error)) return session.uid;
    throw error;
  }
  return data?.admin_title === 'program_chair' && data.admin_id ? (data.admin_id as string) : session.uid;
}

/** For route handlers: the caller and whose curriculum they reach, or the response to return instead. */
export async function curriculumAccess(): Promise<
  | { session: SessionPayload; ownerId: string; supabase: Supabase; response?: never }
  | { session?: never; ownerId?: never; supabase?: never; response: NextResponse }
> {
  const { session, response } = await requireRole('admin');
  if (response) return { response };
  const supabase = getSupabaseAdmin();
  try {
    return { session, supabase, ownerId: await curriculumOwnerId(supabase, session) };
  } catch (err) {
    return { response: curriculumFailure(err, 'Unable to read your account') };
  }
}

export async function ownCurriculum(supabase: Supabase, ownerId: string, id: string): Promise<CurriculumRow | null> {
  return must(
    await supabase.from('curricula').select(CURRICULUM_COLUMNS).eq('id', id).eq('admin_id', ownerId).maybeSingle(),
  ) as CurriculumRow | null;
}

function toCourse(row: Record<string, unknown>, requisites: { course_id: string; requires_id: string; kind: string }[]) {
  const mine = requisites.filter((r) => r.course_id === row.id);
  return {
    id: row.id as string,
    code: row.code as string,
    title: row.title as string,
    year_level: Number(row.year_level),
    term: Number(row.term),
    lecture_units: Number(row.lecture_units),
    lab_units: Number(row.lab_units),
    requisite_note: (row.requisite_note as string) ?? '',
    position: Number(row.position),
    prerequisite_ids: mine.filter((r) => r.kind === 'pre').map((r) => r.requires_id),
    corequisite_ids: mine.filter((r) => r.kind === 'co').map((r) => r.requires_id),
  } satisfies CurriculumCourseRow;
}

export async function loadCurriculumCourses(supabase: Supabase, curriculumId: string): Promise<CurriculumCourseRow[]> {
  const rows = (must(
    await supabase.from('curriculum_courses').select(COURSE_COLUMNS).eq('curriculum_id', curriculumId),
  ) ?? []) as Record<string, unknown>[];
  const ids = rows.map((r) => r.id as string);
  const requisites = ids.length
    ? ((must(
        await supabase.from('curriculum_requisites').select('course_id, requires_id, kind').in('course_id', ids),
      ) ?? []) as { course_id: string; requires_id: string; kind: string }[])
    : [];
  return inCurriculumOrder(rows.map((row) => toCourse(row, requisites)));
}

/** Replaces a course's requisites. Co-requisites go both ways, so its rows on the other side go too. */
export async function saveCourseRequisites(
  supabase: Supabase,
  courseId: string,
  prerequisiteIds: string[],
  corequisiteIds: string[],
): Promise<void> {
  must(await supabase.from('curriculum_requisites').delete().eq('course_id', courseId));
  must(await supabase.from('curriculum_requisites').delete().eq('requires_id', courseId).eq('kind', 'co'));
  const rows = requisiteRows([{ id: courseId, prerequisite_ids: prerequisiteIds, corequisite_ids: corequisiteIds }]);
  if (rows.length) must(await supabase.from('curriculum_requisites').insert(rows));
}

/**
 * Saves a reading of a PDF as a new curriculum that isn't in use. A failure part
 * way through takes the curriculum back out, so a half-saved one never shows.
 */
export async function saveImportedCurriculum(
  supabase: Supabase,
  input: {
    ownerId: string;
    createdBy: string;
    name: string;
    sourceName: string;
    sourcePath: string;
    analysis: CurriculumAnalysis;
    courses: ImportedCourse[];
  },
): Promise<string> {
  const { data, error } = await supabase
    .from('curricula')
    .insert({
      admin_id: input.ownerId,
      name: input.name,
      source_name: input.sourceName,
      source_path: input.sourcePath,
      analysis: input.analysis,
      created_by: input.createdBy,
    })
    .select('id')
    .single();
  if (error) throw error;
  const curriculumId = data.id as string;

  try {
    const inserted = (must(
      await supabase
        .from('curriculum_courses')
        .insert(
          input.courses.map((c) => ({
            curriculum_id: curriculumId,
            code: c.code,
            title: c.title,
            year_level: c.year_level,
            term: c.term,
            lecture_units: c.lecture_units,
            lab_units: c.lab_units,
            requisite_note: c.requisite_note,
            position: c.position,
          })),
        )
        .select('id, code'),
    ) ?? []) as { id: string; code: string }[];

    const idOf = new Map(inserted.map((c) => [c.code, c.id]));
    const ids = (codes: string[]) => codes.map((code) => idOf.get(code)).filter((id): id is string => !!id);
    const rows = requisiteRows(
      input.courses.map((c) => ({
        id: idOf.get(c.code) as string,
        prerequisite_ids: ids(c.prerequisites),
        corequisite_ids: ids(c.corequisites),
      })),
    );
    if (rows.length) must(await supabase.from('curriculum_requisites').insert(rows));
  } catch (err) {
    await supabase.from('curricula').delete().eq('id', curriculumId);
    throw err;
  }
  return curriculumId;
}

/** Best effort: a file left behind costs a little storage, and must not fail what the person asked for. */
export async function removeCurriculumFile(supabase: Supabase, path: string | null | undefined): Promise<void> {
  if (!path) return;
  const { error } = await supabase.storage.from(CURRICULUM_BUCKET).remove([path]);
  if (error) console.error('Failed to remove a curriculum PDF', error);
}

/**
 * What Assign Course offers: the laboratory courses of the curriculum in use, or
 * null to keep the built-in list (none in use, none of its codes end in L, or
 * before 089). A read that fails only loses the list, never the Courses page
 * around it.
 */
export async function loadActiveCatalog(supabase: Supabase, session: SessionPayload): Promise<CatalogCourse[] | null> {
  try {
    const ownerId = await curriculumOwnerId(supabase, session);
    const active = must(
      await supabase.from('curricula').select('id').eq('admin_id', ownerId).eq('is_active', true).maybeSingle(),
    ) as { id: string } | null;
    if (!active) return null;
    const rows = (must(
      await supabase
        .from('curriculum_courses')
        .select('code, title, year_level, term, position')
        .eq('curriculum_id', active.id),
    ) ?? []) as { code: string; title: string; year_level: number; term: number; position: number }[];
    const catalog = catalogOf(rows);
    return catalog.length ? catalog : null;
  } catch (err) {
    if (!isMissingCourseSchema(err)) console.error('Unable to load the curriculum in use', err);
    return null;
  }
}

export const analysisOf = (row: Pick<CurriculumRow, 'analysis'>): CurriculumAnalysis => row.analysis ?? EMPTY_ANALYSIS;
