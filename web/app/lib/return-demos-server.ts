import { NextResponse } from 'next/server';
import type { getSupabaseAdmin } from './supabase/server';
import type { SessionPayload } from './auth/jwt';
import { canFacultySeeScenario, getFacultyStudentIdSet, scenarioVisibleToFaculty } from './scenario-visibility';
import { isMissingKindColumn, RETURN_DEMOS_NEED_MIGRATION, scenarioKindsReady } from './scenario-kind';

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/**
 * Server reads shared by the Return Demonstration routes (072). The rules
 * live in return-demos.ts; this is where they meet the database.
 */

export interface ReturnDemoRow {
  id: string;
  title: string;
  description: string;
  created_by: string | null;
  offering_id: string | null;
  created_at: string;
}

export interface ReturnDemoSummary extends ReturnDemoRow {
  /** Its skills in checklist order: the skill number and the task's title. */
  skills: { id: string; title: string }[];
  /** The viewer's students given it, and how many of them are graded. */
  student_count: number;
  graded_count: number;
}

export interface ReturnDemoTask {
  id: string;
  skill_id: string | null;
  title: string;
  /** Checklist steps (sub-tasks) under it. */
  steps: number;
  /** Whether any student has a grade on it. */
  graded: boolean;
}

const COLUMNS = 'id, title, description, created_by, offering_id, created_at';

export const notFound = () => NextResponse.json({ error: 'Return Demonstration not found' }, { status: 404 });

/** 503 before 072, else null. */
export async function needsMigration(supabase: Supabase): Promise<NextResponse | null> {
  return (await scenarioKindsReady(supabase)) ? null : NextResponse.json({ error: RETURN_DEMOS_NEED_MIGRATION }, { status: 503 });
}

/**
 * One Return Demonstration the viewer may see: 404 when it is missing or is
 * a Patient Case, 403 when it is in another instructor's hands.
 */
export async function loadReturnDemo(
  supabase: Supabase,
  session: Pick<SessionPayload, 'uid' | 'role'>,
  id: string,
): Promise<{ demo: ReturnDemoRow } | { response: NextResponse }> {
  const { data, error } = await supabase.from('scenarios').select(`${COLUMNS}, kind`).eq('id', id).maybeSingle();
  if (error) {
    if (isMissingKindColumn(error)) return { response: notFound() };
    throw new Error(`Unable to read the Return Demonstration: ${error.message}`);
  }
  if (!data || data.kind !== 'return_demo') return { response: notFound() };
  if (session.role === 'faculty' && !(await canFacultySeeScenario(supabase, session.uid, id))) {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  const row = data as ReturnDemoRow;
  return {
    demo: {
      id: row.id,
      title: row.title,
      description: row.description,
      created_by: row.created_by,
      offering_id: row.offering_id,
      created_at: row.created_at,
    },
  };
}

/** Only its maker, or an admin, may change or delete one. */
export function canEdit(session: Pick<SessionPayload, 'uid' | 'role'>, demo: Pick<ReturnDemoRow, 'created_by'>): boolean {
  return session.role === 'admin' || demo.created_by === session.uid;
}

/** The tasks (one per skill) of the given Return Demonstrations, in checklist order. */
export async function loadTasks(
  supabase: Supabase,
  scenarioIds: string[],
): Promise<{ id: string; scenario_id: string; skill_id: string | null; title: string; sort_order: number }[]> {
  if (scenarioIds.length === 0) return [];
  const { data, error } = await supabase
    .from('scenario_tasks')
    .select('id, scenario_id, skill_id, title, sort_order')
    .in('scenario_id', scenarioIds)
    .order('sort_order');
  if (error) throw new Error(`Unable to read the skills: ${error.message}`);
  return (data ?? []) as { id: string; scenario_id: string; skill_id: string | null; title: string; sort_order: number }[];
}

/** The tasks any student has a grade on: a completion row is written when one is graded. */
export async function gradedTaskIds(supabase: Supabase, taskIds: string[]): Promise<Set<string>> {
  if (taskIds.length === 0) return new Set();
  const { data, error } = await supabase.from('scenario_task_completions').select('task_id').in('task_id', taskIds);
  if (error) throw new Error(`Unable to read grades: ${error.message}`);
  return new Set((data ?? []).map((r) => r.task_id as string));
}

/**
 * Every Return Demonstration the viewer may see, newest first, with its
 * skills and the viewer's own students on it. An admin sees all of them.
 */
export async function listReturnDemos(
  supabase: Supabase,
  session: Pick<SessionPayload, 'uid' | 'role'>,
): Promise<ReturnDemoSummary[]> {
  const { data, error } = await supabase
    .from('scenarios')
    .select(`${COLUMNS}, scenario_assignments(student_id, status)`)
    .eq('kind', 'return_demo')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw new Error(`Unable to read Return Demonstrations: ${error.message}`);
  const rows = (data ?? []) as unknown as (ReturnDemoRow & { scenario_assignments: { student_id: string; status: string }[] | null })[];

  const mine = session.role === 'admin' ? null : await getFacultyStudentIdSet(supabase, session.uid);
  const visible = rows.filter((r) => mine === null || scenarioVisibleToFaculty((r.scenario_assignments ?? []).map((a) => a.student_id), mine));
  const tasks = await loadTasks(supabase, visible.map((r) => r.id));

  return visible.map(({ scenario_assignments, ...demo }) => {
    const own = (scenario_assignments ?? []).filter((a) => mine === null || mine.has(a.student_id));
    return {
      ...demo,
      skills: tasks.filter((t) => t.scenario_id === demo.id).map((t) => ({ id: t.skill_id ?? '', title: t.title })),
      student_count: new Set(own.map((a) => a.student_id)).size,
      graded_count: new Set(own.filter((a) => a.status === 'completed').map((a) => a.student_id)).size,
    };
  });
}
