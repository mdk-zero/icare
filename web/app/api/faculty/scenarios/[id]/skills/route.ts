import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { addSkillTasks, parseSkillSelections } from '@/app/lib/skill-tasks';
import { skillsIn } from '@/scripts/taylors-chapters';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** The caller may change this scenario's tasks: its creator, or an admin. */
async function authorize(supabase: Supabase, role: string, uid: string, id: string): Promise<NextResponse | null> {
  const { data } = await supabase.from('scenarios').select('created_by').eq('id', id).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
  if (role !== 'admin' && data.created_by !== uid) {
    return NextResponse.json({ error: 'You can only change scenarios you created' }, { status: 403 });
  }
  return null;
}

/** A task's skill: its link (047), else the "(Skill 1-7)" its title ends with. */
function skillOf(task: { title: string; skill_id?: string | null }): string | null {
  if (task.skill_id) return task.skill_id;
  const m = /\(Skill (\d+-\d+)\)\s*$/.exec(task.title);
  return m ? skillsIn(m[1])[0] ?? null : null;
}

async function readTasks(supabase: Supabase, scenarioId: string) {
  let res = await supabase
    .from('scenario_tasks')
    .select('id, title, skill_id, sort_order')
    .eq('scenario_id', scenarioId)
    .order('sort_order');
  if (res.error?.code === '42703' || res.error?.code === 'PGRST204') {
    // Before 047 there is no skill_id column.
    res = (await supabase
      .from('scenario_tasks')
      .select('id, title, sort_order')
      .eq('scenario_id', scenarioId)
      .order('sort_order')) as typeof res;
  }
  return res;
}

/** GET: the scenario's tasks and the skill each is, if any. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const { data, error } = await readTasks(supabase, id);
  if (error) return NextResponse.json({ error: 'Unable to read tasks' }, { status: 500 });

  const tasks = (data ?? []).map((t) => ({
    id: t.id as string,
    title: t.title as string,
    skill_id: skillOf(t as { title: string; skill_id?: string | null }),
  }));
  const taskIds = tasks.map((t) => t.id);
  // How many students' grades each task holds, so removing one can warn first.
  const { data: graded } = taskIds.length
    ? await supabase.from('scenario_task_completions').select('task_id').in('task_id', taskIds)
    : { data: [] };
  const gradedCount = new Map<string, number>();
  for (const row of graded ?? []) gradedCount.set(row.task_id, (gradedCount.get(row.task_id) ?? 0) + 1);

  return NextResponse.json({ tasks: tasks.map((t) => ({ ...t, graded: gradedCount.get(t.id) ?? 0 })) });
}

/** POST { skills: [{ id, sections? }] }: add a task per skill the scenario doesn't have yet. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  let body: { skills?: unknown };
  try {
    body = (await request.json()) as { skills?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const selections = parseSkillSelections(body.skills);
  if (selections.length === 0) return NextResponse.json({ error: 'Pick at least one skill' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const refused = await authorize(supabase, session.role, session.uid, id);
  if (refused) return refused;

  const { data: existing, error } = await readTasks(supabase, id);
  if (error) return NextResponse.json({ error: 'Unable to read tasks' }, { status: 500 });
  const have = new Set((existing ?? []).map((t) => skillOf(t as { title: string; skill_id?: string | null })));
  const fresh = selections.filter((s) => !have.has(s.skillId));
  const lastOrder = Math.max(0, ...(existing ?? []).map((t) => t.sort_order as number));

  const built = await addSkillTasks(supabase, id, fresh, lastOrder);
  if (built.error) {
    console.error('Failed to add skill tasks', built.error);
    return NextResponse.json({ error: 'Unable to add the skills' }, { status: 500 });
  }
  return NextResponse.json({ added: built.tasks, steps: built.steps, skipped: selections.length - fresh.length });
}

/** DELETE ?task_id=…: remove one task, and every student's grades on it. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const taskId = request.nextUrl.searchParams.get('task_id');
  if (!taskId) return NextResponse.json({ error: 'task_id is required' }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const refused = await authorize(supabase, session.role, session.uid, id);
  if (refused) return refused;

  const { error } = await supabase.from('scenario_tasks').delete().eq('id', taskId).eq('scenario_id', id);
  if (error) {
    console.error('Failed to remove scenario task', error);
    return NextResponse.json({ error: 'Unable to remove the task' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
