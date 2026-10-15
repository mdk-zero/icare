import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { activityCourse } from '@/app/lib/activity-course';
import { addSkillTasks } from '@/app/lib/skill-tasks';
import { parseReturnDemoInput, RETURN_DEMO_CATEGORY } from '@/app/lib/return-demos';
import { listReturnDemos, needsMigration, returnDemosReady } from '@/app/lib/return-demos-server';

// Difficulty is retired, but scenarios.difficulty is NOT NULL with no default.
const RETIRED_DIFFICULTY = 'intermediate';

/**
 * Return Demonstrations (072): Taylor's skill checklists with no patient.
 *
 * GET: every one the viewer may see, newest first, with `enabled: false`
 * (and none) before 070 and 072 so the page can say what is missing.
 * POST { title, description?, offering_id, skills }: make one. Its tasks are
 * the picked skills, each with the skill's checklist steps word for word.
 */
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    const supabase = getSupabaseAdmin();
    if (!(await returnDemosReady(supabase))) return NextResponse.json({ return_demos: [], enabled: false });
    return NextResponse.json({ return_demos: await listReturnDemos(supabase, session), enabled: true });
  } catch (err) {
    console.error('Fetch Return Demonstrations failed', err);
    return NextResponse.json({ error: 'Unable to fetch Return Demonstrations' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const parsed = parseReturnDemoInput(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const input = parsed.value;

  try {
    const supabase = getSupabaseAdmin();
    const blocked = await needsMigration(supabase);
    if (blocked) return blocked;

    const course = await activityCourse(supabase, 'scenarios', session, input.offering_id ?? null);
    if ('error' in course) return NextResponse.json({ error: course.error }, { status: 400 });

    const { data: demo, error } = await supabase
      .from('scenarios')
      .insert({
        created_by: session.uid,
        ...course.value,
        kind: 'return_demo',
        patient_id: null,
        title: input.title,
        description: input.description ?? '',
        difficulty: RETIRED_DIFFICULTY,
        category: RETURN_DEMO_CATEGORY,
        patient_case: {},
        learning_objectives: [],
        is_ai_generated: false,
      })
      .select('id')
      .single();
    if (error || !demo) {
      console.error('Failed to create Return Demonstration', error);
      return NextResponse.json({ error: 'Unable to create the Return Demonstration' }, { status: 500 });
    }

    const built = await addSkillTasks(supabase, demo.id as string, input.skills ?? []);
    if (built.error || built.tasks === 0) {
      // A Return Demonstration is nothing but its skills: don't keep an empty one.
      await supabase.from('scenarios').delete().eq('id', demo.id);
      if (built.error) {
        console.error('Failed to build Return Demonstration skills', built.error);
        return NextResponse.json({ error: 'Unable to create the Return Demonstration' }, { status: 500 });
      }
      return NextResponse.json({ error: 'None of those skills are in the catalog' }, { status: 400 });
    }

    await logAudit(
      session,
      {
        action: 'return_demo.create',
        entityType: 'scenarios',
        entityId: demo.id as string,
        details: { message: `Created Return Demonstration “${input.title}”`, skills: (input.skills ?? []).map((s) => s.skillId) },
      },
      request,
    );
    return NextResponse.json({ return_demo: { id: demo.id } }, { status: 201 });
  } catch (err) {
    console.error('Create Return Demonstration failed', err);
    return NextResponse.json({ error: 'Unable to create the Return Demonstration' }, { status: 500 });
  }
}
