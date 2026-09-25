import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getSkills, listSkills } from '@/app/lib/taylor-skills';

/** At most this many skills' steps per request; a scenario rarely needs more than a handful. */
const MAX_DETAIL = 20;

/**
 * The Taylor's skills catalog.
 *   GET /api/skills             every skill, without steps
 *   GET /api/skills?ids=1-1,5-3 those skills with their checklist steps
 */
export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = getSupabaseAdmin();
  const ids = request.nextUrl.searchParams.get('ids');
  if (ids) {
    const list = ids.split(',').map((s) => s.trim()).filter(Boolean);
    if (list.length > MAX_DETAIL) {
      return NextResponse.json({ error: `At most ${MAX_DETAIL} skills at a time` }, { status: 400 });
    }
    return NextResponse.json({ skills: await getSkills(supabase, list) });
  }
  return NextResponse.json({ skills: await listSkills(supabase) });
}
