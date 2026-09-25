import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { ensureCategories } from '@/app/lib/scenario-categories';
import { MAX_RUBRIC_LENGTH, TASK_RATINGS } from '@/app/lib/task-ratings';

const validDifficulties = ['beginner', 'intermediate', 'advanced'] as const;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

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
    rubric,
  } = body as {
    title?: unknown;
    description?: unknown;
    difficulty?: unknown;
    category?: unknown;
    patient_case?: unknown;
    patient_id?: unknown;
    learning_objectives?: unknown;
    rubric?: unknown;
  };

  const updateData: Record<string, unknown> = {};

  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title cannot be empty' }, { status: 400 });
    }
    updateData.title = title.trim();
  }

  if (description !== undefined) {
    updateData.description = typeof description === 'string' ? description.trim() : '';
  }

  if (difficulty !== undefined) {
    if (!validDifficulties.includes(difficulty as typeof validDifficulties[number])) {
      return NextResponse.json({ error: 'Invalid difficulty' }, { status: 400 });
    }
    updateData.difficulty = difficulty;
  }


  if (patient_case !== undefined) {
    updateData.patient_case = patient_case && typeof patient_case === 'object' ? patient_case : {};
  }

  // patient_id can switch a scenario to a different patient, but — since every
  // scenario must have one — never clear it; omit the field entirely to leave
  // it unchanged.
  if (patient_id !== undefined) {
    if (typeof patient_id !== 'string' || patient_id.trim().length === 0) {
      return NextResponse.json(
        { error: 'A scenario always needs a patient — pick a different one instead of removing it' },
        { status: 400 },
      );
    }
    updateData.patient_id = patient_id.trim();
  }

  if (learning_objectives !== undefined) {
    updateData.learning_objectives = Array.isArray(learning_objectives)
      ? learning_objectives.filter((o): o is string => typeof o === 'string')
      : [];
  }

  // The scenario's own wording per level; blank levels (or null for the
  // whole rubric) fall back to the book's definitions.
  if (rubric !== undefined) {
    if (rubric !== null && (typeof rubric !== 'object' || Array.isArray(rubric))) {
      return NextResponse.json({ error: 'rubric must be an object or null' }, { status: 400 });
    }
    const own: Record<string, string> = {};
    for (const level of TASK_RATINGS) {
      const text = (rubric as Record<string, unknown> | null)?.[level.key];
      if (typeof text === 'string' && text.trim()) own[level.key] = text.trim().slice(0, MAX_RUBRIC_LENGTH);
    }
    updateData.rubric = Object.keys(own).length > 0 ? own : null;
  }

  // Resolved against the category table further down, once the caller is
  // known to own the scenario — a refused edit mustn't create a category.
  if (Object.keys(updateData).length === 0 && category === undefined) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Only the creator or an admin can update.
    const { data: existing } = await supabase
      .from('scenarios')
      .select('created_by')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    if (session.role !== 'admin' && existing.created_by !== session.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (category !== undefined) {
      const resolved = await ensureCategories(
        supabase,
        [typeof category === 'string' && category.trim() ? category : 'General'],
        'faculty',
        session.uid,
      );
      if ('error' in resolved) {
        return NextResponse.json({ error: resolved.error }, { status: resolved.status });
      }
      updateData.category = resolved.names[0];
    }

    if (typeof updateData.patient_id === 'string') {
      const { data: patient } = await supabase
        .from('patients')
        .select('id')
        .eq('id', updateData.patient_id)
        .maybeSingle();
      if (!patient) {
        return NextResponse.json({ error: 'Patient not found' }, { status: 400 });
      }
    }

    const { data: scenario, error } = await supabase
      .from('scenarios')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error?.code === '42703' || error?.code === 'PGRST204') {
      return NextResponse.json(
        { error: 'Custom rubrics need database migration 046 applied first.' },
        { status: 503 },
      );
    }
    if (error || !scenario) {
      console.error('Failed to update scenario', error);
      return NextResponse.json({ error: 'Unable to update scenario' }, { status: 500 });
    }

    return NextResponse.json({ scenario });
  } catch (err) {
    console.error('Update scenario failed', err);
    return NextResponse.json({ error: 'Unable to update scenario' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('scenarios')
      .select('created_by')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Scenario not found' }, { status: 404 });
    }

    if (session.role !== 'admin' && existing.created_by !== session.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { error } = await supabase.from('scenarios').delete().eq('id', id);

    if (error) {
      console.error('Failed to delete scenario', error);
      return NextResponse.json({ error: 'Unable to delete scenario' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete scenario failed', err);
    return NextResponse.json({ error: 'Unable to delete scenario' }, { status: 500 });
  }
}
