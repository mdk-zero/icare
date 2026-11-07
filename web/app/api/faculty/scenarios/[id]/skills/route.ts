import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { isReturnDemo } from '@/app/lib/scenario-kind';
import { scenarioInDeanScope } from '@/app/lib/scenario-visibility';
import { logAudit } from '@/app/lib/audit';
import { loadSkillTasks, parseSkillSelections, saveSkillTasks } from '@/app/lib/skill-tasks';
import { checklistProblem } from '@/app/lib/skill-checklists';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type Supabase = ReturnType<typeof getSupabaseAdmin>;

/** The caller may change this scenario's tasks: its creator, or their admin. */
async function authorize(supabase: Supabase, role: string, uid: string, id: string): Promise<NextResponse | null> {
  const { data } = await supabase.from('scenarios').select('created_by').eq('id', id).maybeSingle();
  // A Return Demonstration's skills change through its own edit (072); another
  // Dean's case (077) is not found at all.
  if (!data || (await isReturnDemo(supabase, id)) || !(await scenarioInDeanScope(supabase, { uid, role }, id))) {
    return NextResponse.json({ error: 'Patient case not found' }, { status: 404 });
  }
  if (role !== 'admin' && data.created_by !== uid) {
    return NextResponse.json({ error: 'You can only change patient cases you created' }, { status: 403 });
  }
  return null;
}

/**
 * GET: the scenario's tasks in order, each with the skill it is (if any), its
 * chapter when it is the instructor's own, its steps, and how many students
 * are graded on it.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!(await scenarioInDeanScope(supabase, session, id))) {
    return NextResponse.json({ error: 'Patient case not found' }, { status: 404 });
  }
  try {
    const tasks = await loadSkillTasks(supabase, id);
    return NextResponse.json({
      tasks: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        skill_id: t.skill_id,
        chapter: t.chapter,
        graded: t.graded,
        checklist: t.steps.map((s) => ({ id: s.id, title: s.title, skill_step_id: s.skill_step_id })),
      })),
    });
  } catch (err) {
    console.error('Failed to read patient case tasks', err);
    return NextResponse.json({ error: 'Unable to read tasks' }, { status: 500 });
  }
}

/**
 * PUT { skills }: the case's whole skill list as edited, in order. New skills
 * are added, kept ones renamed or given their edited steps, and the rest
 * removed. A skill a student is graded on can't lose or change its steps
 * (409).
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
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
  if (!Array.isArray(body.skills)) return NextResponse.json({ error: 'skills is required' }, { status: 400 });
  const selections = parseSkillSelections(body.skills);
  const problem = checklistProblem(selections);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const supabase = getSupabaseAdmin();
  const refused = await authorize(supabase, session.role, session.uid, id);
  if (refused) return refused;

  try {
    const saved = await saveSkillTasks(supabase, id, selections);
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: saved.status });
    await logAudit(
      session,
      {
        action: 'scenario.skills_update',
        entityType: 'scenarios',
        entityId: id,
        details: {
          message: 'Edited the skills and steps of a patient case',
          added: saved.added,
          changed: saved.changed,
          removed: saved.removed,
        },
      },
      request,
    );
    return NextResponse.json({
      added: saved.added,
      changed: saved.changed,
      removed: saved.removed,
      chapters_saved: !saved.noChapters,
    });
  } catch (err) {
    console.error('Failed to save patient case skills', err);
    return NextResponse.json({ error: 'Unable to save the skills' }, { status: 500 });
  }
}
