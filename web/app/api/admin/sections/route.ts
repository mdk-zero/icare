import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name } = body as { name?: unknown };
  if (typeof name !== 'string' || name.trim().length === 0) {
    return NextResponse.json({ error: 'Section name is required' }, { status: 400 });
  }
  const trimmedName = name.trim();
  if (trimmedName.length > 50) {
    return NextResponse.json({ error: 'Section name is too long (max 50 characters)' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('sections')
      .select('id')
      .ilike('name', trimmedName)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'A section with this name already exists' }, { status: 409 });
    }

    const { data: section, error } = await supabase
      .from('sections')
      .insert({ name: trimmedName })
      .select('id, name')
      .single();

    if (error) {
      console.error('Failed to create section', error);
      return NextResponse.json({ error: 'Unable to create section' }, { status: 500 });
    }

    await logAudit(
      session,
      { action: 'section.create', entityType: 'sections', entityId: section.id, details: { name: section.name } },
      request,
    );

    return NextResponse.json({ section }, { status: 201 });
  } catch (err) {
    console.error('Create section failed', err);
    return NextResponse.json({ error: 'Unable to create section' }, { status: 500 });
  }
}
