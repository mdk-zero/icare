import type { getSupabaseAdmin } from './supabase/server';
import {
  attendanceRows,
  collectActivities,
  isMissingExcusesTable,
  type ActivityKind,
  type ActivitySources,
  type AttendanceRow,
  type ExcuseFact,
} from './attendance';
import { isMissingCaseTables } from './cases';
import { fetchAll } from './fetch-all';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** PostgREST puts `in` lists in the URL, so long ones go a chunk at a time. */
const CHUNK = 200;

async function chunked<T>(ids: string[], read: (part: string[]) => PromiseLike<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += CHUNK) out.push(...(await read(ids.slice(i, i + CHUNK))));
  return out;
}

type Title = { title: string } | null;

/**
 * Students' activities with their attendance (lib/attendance.ts): every
 * RetDem, Quiz and Case Presentation they were given, when they did it, and
 * any excuse. With a window, only activities due inside it [from, to) are
 * kept, and those with no deadline are left out. Before migration 068 there
 * are no excuses, and excusesReady says so.
 */
export async function loadActivityAttendance(
  supabase: Supabase,
  studentIds: string[],
  opts: { from?: string; to?: string; now?: number } = {},
): Promise<{ rows: AttendanceRow[]; excusesReady: boolean }> {
  if (studentIds.length === 0) return { rows: [], excusesReady: true };

  // Each chunk of students is read a page at a time: one response holds at
  // most 1000 rows, and a section's history passes that quickly.
  const [scenarioAssignments, quizAssignments, caseSubmissions, excuses] = await Promise.all([
    chunked(studentIds, async (part) =>
      (
        await fetchAll<{ id: string; student_id: string; scenario_id: string; deadline: string | null; scenarios: Title }>((from, to) =>
          supabase
            .from('scenario_assignments')
            .select('id, student_id, scenario_id, deadline, scenarios(title)')
            .in('student_id', part)
            .order('id')
            .range(from, to),
        )
      ).map((a) => ({
        id: a.id,
        student_id: a.student_id,
        scenario_id: a.scenario_id,
        title: a.scenarios?.title ?? 'Patient case',
        deadline: a.deadline,
      })),
    ),
    chunked(studentIds, async (part) =>
      (
        await fetchAll<{
          id: string;
          student_id: string;
          assessment_id: string;
          deadline: string | null;
          assessments: { title: string; deadline: string | null } | null;
        }>((from, to) =>
          supabase
            .from('assessment_assignments')
            .select('id, student_id, assessment_id, deadline, assessments(title, deadline)')
            .in('student_id', part)
            .order('id')
            .range(from, to),
        )
      ).map((a) => ({
        id: a.id,
        student_id: a.student_id,
        assessment_id: a.assessment_id,
        title: a.assessments?.title ?? 'Quiz',
        deadline: a.deadline,
        default_deadline: a.assessments?.deadline ?? null,
      })),
    ),
    chunked(studentIds, async (part) => {
      let rows: {
        student_id: string;
        presentation_id: string;
        submitted_at: string | null;
        case_presentations: { title: string; deadline: string | null } | null;
      }[];
      try {
        rows = await fetchAll((from, to) =>
          supabase
            .from('case_submissions')
            .select('student_id, presentation_id, submitted_at, case_presentations(title, deadline)')
            .in('student_id', part)
            .order('id')
            .range(from, to),
        );
      } catch (err) {
        // Before 056 there are no case presentations.
        if (isMissingCaseTables(err as { code?: string })) return [];
        throw err;
      }
      return rows.map((s) => ({
        student_id: s.student_id,
        presentation_id: s.presentation_id,
        submitted_at: s.submitted_at,
        title: s.case_presentations?.title ?? 'Case presentation',
        deadline: s.case_presentations?.deadline ?? null,
      }));
    }),
    loadExcuses(supabase, studentIds),
  ]);

  // Only the attempts on quizzes these students were given, and only the
  // graded tasks of their RetDems.
  const quizIds = [...new Set(quizAssignments.map((a) => a.assessment_id))];
  const [attempts, completions] = await Promise.all([
    quizIds.length === 0
      ? Promise.resolve([] as ActivitySources['attempts'])
      : chunked(studentIds, (part) =>
          fetchAll<ActivitySources['attempts'][number]>((from, to) =>
            supabase
              .from('assessment_attempts')
              .select('student_id, assessment_id, status, submitted_at')
              .in('student_id', part)
              .in('assessment_id', quizIds)
              .eq('status', 'submitted')
              .order('id')
              .range(from, to),
          ),
        ),
    chunked(
      scenarioAssignments.map((a) => a.id),
      (part) =>
        fetchAll<ActivitySources['completions'][number]>((from, to) =>
          supabase
            .from('scenario_task_completions')
            .select('assignment_id, completed_at')
            .in('assignment_id', part)
            .order('id')
            .range(from, to),
        ),
    ),
  ]);

  // Compared as instants: the database writes +00:00 where the bounds may use Z.
  const from = opts.from ? Date.parse(opts.from) : null;
  const to = opts.to ? Date.parse(opts.to) : null;
  const activities = collectActivities({ scenarioAssignments, completions, quizAssignments, attempts, caseSubmissions }).filter(
    (a) => {
      if (from === null && to === null) return true;
      if (!a.deadline) return false;
      const due = Date.parse(a.deadline);
      return (from === null || due >= from) && (to === null || due < to);
    },
  );
  return {
    rows: attendanceRows(activities, excuses ?? [], opts.now ?? Date.now()),
    excusesReady: excuses !== null,
  };
}

/** The students' excuses, or null before migration 068. */
async function loadExcuses(supabase: Supabase, studentIds: string[]): Promise<ExcuseFact[] | null> {
  try {
    return await chunked(studentIds, async (part) =>
      (
        await fetchAll<{
          student_id: string;
          activity_kind: ActivityKind;
          activity_id: string;
          reason: string;
          created_at: string;
          excused_by_user: { name: string | null } | null;
        }>((from, to) =>
          supabase
            .from('activity_excuses')
            .select('student_id, activity_kind, activity_id, reason, created_at, excused_by_user:users!activity_excuses_excused_by_fkey(name)')
            .in('student_id', part)
            .order('id')
            .range(from, to),
        )
      ).map((e) => ({
        student_id: e.student_id,
        kind: e.activity_kind,
        activity_id: e.activity_id,
        reason: e.reason,
        excused_by_name: e.excused_by_user?.name ?? null,
        created_at: e.created_at,
      })),
    );
  } catch (err) {
    if (isMissingExcusesTable(err as { code?: string })) return null;
    throw err;
  }
}
