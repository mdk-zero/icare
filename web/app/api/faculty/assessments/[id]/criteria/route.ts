import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

export async function GET(
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
    const { data, error } = await supabase
      .from('assessment_criteria')
      .select('id, assessment_id, name, weight, competency_id, sort_order, created_at')
      .eq('assessment_id', id)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('Failed to fetch criteria', error);
      return NextResponse.json({ error: 'Unable to fetch criteria' }, { status: 500 });
    }

    return NextResponse.json({ criteria: data ?? [] });
  } catch (err) {
    console.error('Fetch criteria failed', err);
    return NextResponse.json({ error: 'Unable to fetch criteria' }, { status: 500 });
  }
}

export async function POST(
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

  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Criteria name is required' }, { status: 400 });
  }

  if (typeof weight !== 'number' || weight <= 0 || weight > 100) {
    return NextResponse.json({ error: 'Weight must be a number between 1 and 100' }, { status: 400 });
  }

  if (typeof competency_id !== 'string' || competency_id.trim().length === 0) {
    return NextResponse.json({ error: 'Competency is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const sortOrder = typeof sort_order === 'number' ? sort_order : 0;

    const { data, error } = await supabase
      .from('assessment_criteria')
      .insert({
        assessment_id: id,
        name: name.trim(),
        weight,
        competency_id,
        sort_order: sortOrder,
      })
      .select('id, assessment_id, name, weight, competency_id, sort_order, created_at')
      .single();

    if (error) {
      console.error('Failed to create criteria', error);
      return NextResponse.json({ error: 'Unable to create criteria' }, { status: 500 });
    }

    return NextResponse.json({ criteria: data }, { status: 201 });
  } catch (err) {
    console.error('Create criteria failed', err);
    return NextResponse.json({ error: 'Unable to create criteria' }, { status: 500 });
  }
}
