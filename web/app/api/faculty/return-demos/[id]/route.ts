import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { activityCourse } from '@/app/lib/activity-course';
import { loadSkillTasks, saveSkillTasks } from '@/app/lib/skill-tasks';
import { getFacultyStudentIdSet } from '@/app/lib/scenario-visibility';
import { parseReturnDemoInput } from '@/app/lib/return-demos';
import {
  canEdit,
  gradedTaskIds,
  loadReturnDemo,
  loadTasks,
  type ReturnDemoSummary,
  type ReturnDemoTask,
} from '@/app/lib/return-demos-server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const forbidden = () => NextResponse.json({ error: 'Only its maker can change this Return Demonstration' }, { status: 403 });

async function staff() {
  const session = await readSession();
  if (!session) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!['faculty', 'admin'].includes(session.role)) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { session };
}

/** GET: one Return Demonstration with its skills, each skill's steps and whether anyone is graded on it. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = await staff();
  if ('response' in auth) return auth.response;
  const { session } = auth;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadReturnDemo(supabase, session, id);
    if ('response' in loaded) return loaded.response;

    const [tasks, assignmentsRes, mine] = await Promise.all([
      loadSkillTasks(supabase, id),
      supabase.from('scenario_assignments').select('student_id, status').eq('scenario_id', id),
      session.role === 'admin' ? Promise.resolve(null) : getFacultyStudentIdSet(supabase, session.uid),
    ]);
    if (assignmentsRes.error) throw assignmentsRes.error;
    const own = ((assignmentsRes.data ?? []) as { student_id: string; status: string }[]).filter((a) => mine === null || mine.has(a.student_id));

    const result: ReturnDemoSummary & { tasks: ReturnDemoTask[] } = {
      ...loaded.demo,
      skills: tasks.map((t) => ({ id: t.skill_id ?? '', title: t.title })),
      student_count: new Set(own.map((a) => a.student_id)).size,
      graded_count: new Set(own.filter((a) => a.status === 'completed').map((a) => a.student_id)).size,
      can_edit: canEdit(session, loaded.demo),
      tasks: tasks.map((t) => ({
        id: t.id,
        skill_id: t.skill_id,
        title: t.title,
        chapter: t.chapter,
        checklist: t.steps.map((s) => ({ id: s.id, title: s.title, skill_step_id: s.skill_step_id })),
        graded: t.graded > 0,
      })),
    };
    return NextResponse.json({ return_demo: result });
  } catch (err) {
    console.error('Fetch Return Demonstration failed', err);
    return NextResponse.json({ error: 'Unable to fetch the Return Demonstration' }, { status: 500 });
  }
}

/**
 * PATCH { title?, description?, offering_id?, skills? }: edit one. `skills`
 * is the whole list as edited, in order: new skills are added, kept ones
 * renamed or given their edited steps, and dropped ones removed with their
 * steps. A skill a student has been graded on can't be removed or have its
 * steps changed; that refuses the whole edit (409) so nobody's grade is lost.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await staff();
  if ('response' in auth) return auth.response;
  const { session } = auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = parseReturnDemoInput(body, { partial: true });
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadReturnDemo(supabase, session, id);
    if ('response' in loaded) return loaded.response;
    if (!canEdit(session, loaded.demo)) return forbidden();

    // Every check before any write, so a refused edit changes nothing.
    const update: Record<string, unknown> = {};
    if (input.title !== undefined) update.title = input.title;
    if (input.description !== undefined) update.description = input.description;
    if (input.offering_id !== undefined) {
      const course = await activityCourse(supabase, 'scenarios', session, input.offering_id);
      if ('error' in course) return NextResponse.json({ error: course.error }, { status: 400 });
      Object.assign(update, course.value);
    }

    let saved: { added: number; changed: number; removed: number; noChapters: boolean } | null = null;
    if (input.skills) {
      const result = await saveSkillTasks(supabase, id, input.skills, { requireOne: true });
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
      saved = result;
    }
    if (Object.keys(update).length > 0) {
      const { error } = await supabase.from('scenarios').update({ ...update, updated_at: new Date().toISOString() }).eq('id', id);
      if (error) throw error;
    }

    await logAudit(
      session,
      {
        action: 'return_demo.update',
        entityType: 'scenarios',
        entityId: id,
        details: {
          message: `Edited Return Demonstration “${input.title ?? loaded.demo.title}”`,
          added: saved?.added ?? 0,
          changed: saved?.changed ?? 0,
          removed: saved?.removed ?? 0,
        },
      },
      request,
    );
    return NextResponse.json({
      ok: true,
      added: saved?.added ?? 0,
      changed: saved?.changed ?? 0,
      removed: saved?.removed ?? 0,
      chapters_saved: !saved?.noChapters,
    });
  } catch (err) {
    console.error('Update Return Demonstration failed', err);
    return NextResponse.json({ error: 'Unable to update the Return Demonstration' }, { status: 500 });
  }
}

/** DELETE: remove one nobody has been graded on yet; its tasks and assignments go with it. */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await staff();
  if ('response' in auth) return auth.response;
  const { session } = auth;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadReturnDemo(supabase, session, id);
    if ('response' in loaded) return loaded.response;
    if (!canEdit(session, loaded.demo)) return forbidden();

    const tasks = await loadTasks(supabase, [id]);
    if ((await gradedTaskIds(supabase, tasks.map((t) => t.id))).size > 0) {
      return NextResponse.json(
        { error: "Students have been graded on this Return Demonstration, so it can't be deleted." },
        { status: 409 },
      );
    }

    const { error } = await supabase.from('scenarios').delete().eq('id', id);
    if (error) throw error;

    await logAudit(
      session,
      {
        action: 'return_demo.delete',
        entityType: 'scenarios',
        entityId: id,
        details: { message: `Deleted Return Demonstration “${loaded.demo.title}”` },
      },
      request,
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete Return Demonstration failed', err);
    return NextResponse.json({ error: 'Unable to delete the Return Demonstration' }, { status: 500 });
  }
}
