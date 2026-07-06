import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

const validDifficulties = ['beginner', 'intermediate', 'advanced'] as const;
const validCategories = [
  'Cardiac Emergency',
  'Respiratory Emergency',
  'Neurological Emergency',
  'Trauma',
  'Medical-Surgical',
  'Patient Education',
  'Infection Management',
  'Critical Care',
  'Medication Safety',
  'General',
] as const;

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
        'id, created_by, title, description, difficulty, category, learning_objectives, is_ai_generated, created_at, updated_at, scenario_assignments(count)',
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

    const formatted = scenarios.map((s) => ({
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
      student_count: Number((s as unknown as { scenario_assignments: [{ count: number }] }).scenario_assignments?.[0]?.count ?? 0),
    }));

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
    learning_objectives,
    is_ai_generated,
  } = body as {
    title?: unknown;
    description?: unknown;
    difficulty?: unknown;
    category?: unknown;
    patient_case?: unknown;
    learning_objectives?: unknown;
    is_ai_generated?: unknown;
  };

  if (typeof title !== 'string' || title.trim().length === 0) {
    return NextResponse.json({ error: 'Title is required' }, { status: 400 });
  }

  if (!validDifficulties.includes(difficulty as typeof validDifficulties[number])) {
    return NextResponse.json({ error: 'Invalid difficulty' }, { status: 400 });
  }

  if (!validCategories.includes(category as typeof validCategories[number])) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }

  const sanitizedLearningObjectives = Array.isArray(learning_objectives)
    ? learning_objectives.filter((o): o is string => typeof o === 'string')
    : [];

  try {
    const supabase = getSupabaseAdmin();

    const { data: scenario, error } = await supabase
      .from('scenarios')
      .insert({
        created_by: session.uid,
        title: title.trim(),
        description: typeof description === 'string' ? description.trim() : '',
        difficulty: difficulty as typeof validDifficulties[number],
        category: category as typeof validCategories[number],
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

    return NextResponse.json({ scenario }, { status: 201 });
  } catch (err) {
    console.error('Create scenario failed', err);
    return NextResponse.json({ error: 'Unable to create scenario' }, { status: 500 });
  }
}
