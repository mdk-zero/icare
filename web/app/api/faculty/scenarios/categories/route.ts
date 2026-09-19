import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { ensureCategories, listCategories } from '@/app/lib/scenario-categories';

/** More than a lesson's topic pass ever proposes; guards against a runaway client. */
const MAX_PER_REQUEST = 10;

function isFacultyOrAdmin(role: string | undefined): boolean {
  return role === 'faculty' || role === 'admin';
}

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isFacultyOrAdmin(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json({ categories: await listCategories(getSupabaseAdmin()) });
}

/**
 * Creates the categories a faculty member confirmed — typically topics
 * detected in an imported lesson. Names already present in any case are
 * reused, so `created` is each requested name's stored spelling.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isFacultyOrAdmin(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { names?: unknown; source?: unknown };
  try {
    body = (await request.json()) as { names?: unknown; source?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const names = Array.isArray(body.names)
    ? body.names.filter((n): n is string => typeof n === 'string')
    : [];
  if (names.length === 0) {
    return NextResponse.json({ error: 'At least one category name is required' }, { status: 400 });
  }
  if (names.length > MAX_PER_REQUEST) {
    return NextResponse.json({ error: `At most ${MAX_PER_REQUEST} categories at a time` }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const result = await ensureCategories(
    supabase,
    names,
    body.source === 'lesson' ? 'lesson' : 'faculty',
    session.uid,
  );
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({
    created: result.names,
    categories: await listCategories(supabase),
  });
}
