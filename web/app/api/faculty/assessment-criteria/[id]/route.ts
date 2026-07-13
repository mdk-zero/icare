import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, weight, competency_id, sort_order } = body as {
    name?: unknown;
    weight?: unknown;
    competency_id?: unknown;
    sort_order?: unknown;
  };

  const update: Record<string, unknown> = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Criteria name cannot be empty' }, { status: 400 });
    }
    update.name = name.trim();
  }

  if (weight !== undefined) {
    if (typeof weight !== 'number' || weight <= 0 || weight > 100) {
      return NextResponse.json({ error: 'Weight must be between 1 and 100' }, { status: 400 });
    }
    update.weight = weight;
  }

  if (competency_id !== undefined) {
    if (typeof competency_id !== 'string' || competency_id.trim().length === 0) {
      return NextResponse.json({ error: 'Competency is required' }, { status: 400 });
    }
    update.competency_id = competency_id;
  }

  if (sort_order !== undefined) {
    if (typeof sort_order !== 'number') {
      return NextResponse.json({ error: 'Invalid sort_order' }, { status: 400 });
    }
    update.sort_order = sort_order;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('assessment_criteria')
      .update(update)
      .eq('id', id)
      .select('id, assessment_id, name, weight, competency_id, sort_order, created_at')
      .single();

    if (error) {
      console.error('Failed to update criteria', error);
      return NextResponse.json({ error: 'Unable to update criteria' }, { status: 500 });
    }

    return NextResponse.json({ criteria: data });
  } catch (err) {
    console.error('Update criteria failed', err);
    return NextResponse.json({ error: 'Unable to update criteria' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('assessment_criteria').delete().eq('id', id);

    if (error) {
      console.error('Failed to delete criteria', error);
      return NextResponse.json({ error: 'Unable to delete criteria' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete criteria failed', err);
    return NextResponse.json({ error: 'Unable to delete criteria' }, { status: 500 });
  }
}
