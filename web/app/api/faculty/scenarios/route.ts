import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { seedScenarioTasks } from '@/app/lib/scenario-default-tasks';
import { ensureCategories } from '@/app/lib/scenario-categories';
import { addSkillTasks, parseSkillSelections } from '@/app/lib/skill-tasks';
import {
  getFacultyStudentIdSet,
  scenarioVisibleToFaculty,
} from '@/app/lib/scenario-visibility';

const validDifficulties = ['beginner', 'intermediate', 'advanced'] as const;

function forbiddenResponse() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET() {
  const session = await readSession();
  if (!session) return unauthorizedResponse();
  if (!['faculty', 'admin'].includes(session.role)) return forbiddenResponse();

  try {
    const supabase = getSupabaseAdmin();

    const { data: scenarios, error } = await supabase
      .from('scenarios')
      .select(
        'id, created_by, title, description, difficulty, category, learning_objectives, is_ai_generated, created_at, updated_at, patient_id, patients(name), scenario_assignments(student_id)',
      )
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) {
      console.error('Failed to fetch scenarios', error);
      return NextResponse.json(
        { error: 'Unable to fetch scenarios', details: error.message },
        { status: 500 },
      );
    }

    // An admin oversees every section, so nothing is filtered for them.
    const facultyStudentIds =
      session.role === 'admin'
        ? null
        : await getFacultyStudentIdSet(supabase, session.uid);

    const visible = scenarios.filter((s) => {
      if (facultyStudentIds === null) return true;
      const assigned = (s as unknown as { scenario_assignments: { student_id: string }[] })
        .scenario_assignments ?? [];
      return scenarioVisibleToFaculty(
        assigned.map((a) => a.student_id),
        facultyStudentIds,
      );
    });

    const formatted = visible.map((s) => {
      const assigned = (s as unknown as { scenario_assignments: { student_id: string }[] })
        .scenario_assignments ?? [];
      // Count the students this viewer actually teaches. The raw total would
      // report other faculty's assignments on a shared scenario, which reads
      // as "3 students" on a card that only lists one of them.
      const ownAssigned =
        facultyStudentIds === null
          ? assigned.length
          : assigned.filter((a) => facultyStudentIds.has(a.student_id)).length;
      return {
        id: s.id,
        created_by: s.created_by,
        title: s.title,
        description: s.description,
        difficulty: s.difficulty,
        category: s.category,
        learning_objectives: Array.isArray(s.learning_objectives) ? s.learning_objectives : [],
        is_ai_generated: s.is_ai_generated,
        created_at: s.created_at,
        updated_at: s.updated_at,
        patient_id: s.patient_id,
        patient_name: (s as unknown as { patients: { name: string } | null }).patients?.name ?? null,
        student_count: ownAssigned,
      };
    });

    return NextResponse.json({ scenarios: formatted });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Fetch scenarios failed', err);
    return NextResponse.json(
      { error: 'Unable to fetch scenarios', details: message },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorizedResponse();
  if (!['faculty', 'admin'].includes(session.role)) return forbiddenResponse();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    title,
    description,
    difficulty,
    category,
    patient_case,
    patient_id,
    learning_objectives,
    is_ai_generated,
    skills,
  } = body as {
    title?: unknown;
    description?: unknown;
    difficulty?: unknown;
    category?: unknown;
    patient_case?: unknown;
    patient_id?: unknown;
    learning_objectives?: unknown;
    is_ai_generated?: unknown;
    skills?: unknown;
  };

  if (typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  if (!validDifficulties.includes(difficulty as typeof validDifficulties[number])) {
    return NextResponse.json({ error: 'Invalid difficulty' }, { status: 400 });
  }


  const sanitizedLearningObjectives = Array.isArray(learning_objectives)
    ? learning_objectives.filter((o): o is string => typeof o === 'string')
    : [];

  // Every scenario is grounded on a real patient record, whether it was typed
  // by hand or generated (with or without AI) — that's what lets students
  // chart vitals and EHR data against it.
  if (typeof patient_id !== 'string' || patient_id.trim().length === 0) {
    return NextResponse.json({ error: 'Select a patient for this scenario' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const linkedPatientId = patient_id.trim();
    const { data: patient } = await supabase
      .from('patients')
      .select('id')
      .eq('id', linkedPatientId)
      .maybeSingle();
    if (!patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 400 });
    }

    // A category typed on the form (or confirmed from a lesson) is created
    // here if it's new; one matching an existing category in another case
    // takes that category's spelling.
    const resolved = await ensureCategories(
      supabase,
      [typeof category === 'string' && category.trim() ? category : 'General'],
      'faculty',
      session.uid,
    );
    if ('error' in resolved) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.status });
    }

    const { data: scenario, error } = await supabase
      .from('scenarios')
      .insert({
        created_by: session.uid,
        patient_id: linkedPatientId,
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() : '',
        difficulty: difficulty as typeof validDifficulties[number],
        category: resolved.names[0],
        patient_case: patient_case && typeof patient_case === 'object' ? patient_case : {},
        learning_objectives: sanitizedLearningObjectives,
        is_ai_generated: typeof is_ai_generated === 'boolean' ? is_ai_generated : false,
      })
      .select()
      .single();

    if (error || !scenario) {
      console.error('Failed to create scenario', error);
      return NextResponse.json({ error: 'Unable to create scenario' }, { status: 500 });
    }

    // Its tasks are the Taylor's skills faculty confirmed, each with the
    // skill's checklist steps. A scenario saved without any gets the default
    // task list, so it still works; skills can be added afterwards.
    const selections = parseSkillSelections(skills);
    const built = selections.length > 0 ? await addSkillTasks(supabase, scenario.id, selections) : null;
    if (built?.error) console.error('Failed to build skill tasks', built.error);
    if (!built || built.tasks === 0) await seedScenarioTasks(supabase, scenario.id);

    return NextResponse.json({ scenario }, { status: 201 });
  } catch (err) {
    console.error('Create scenario failed', err);
    return NextResponse.json({ error: 'Unable to create scenario' }, { status: 500 });
  }
}
