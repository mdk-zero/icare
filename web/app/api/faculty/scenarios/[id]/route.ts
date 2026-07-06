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
    learning_objectives,
  } = body as {
    title?: unknown;
    description?: unknown;
    difficulty?: unknown;
    category?: unknown;
    patient_case?: unknown;
    learning_objectives?: unknown;
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

  if (category !== undefined) {
    if (!validCategories.includes(category as typeof validCategories[number])) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }
    updateData.category = category;
  }

  if (patient_case !== undefined) {
    updateData.patient_case = patient_case && typeof patient_case === 'object' ? patient_case : {};
  }

  if (learning_objectives !== undefined) {
    updateData.learning_objectives = Array.isArray(learning_objectives)
      ? learning_objectives.filter((o): o is string => typeof o === 'string')
      : [];
  }

  if (Object.keys(updateData).length === 0) {
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

    const { data: scenario, error } = await supabase
      .from('scenarios')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

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
