import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { getScopedSectionIds, getScopedStudentIds } from '@/app/lib/admin-scope';
import { ownsRow, viewerDeanId } from '@/app/lib/dean-scope';
import { getFacultySectionIds } from '@/app/lib/roster';
import { isFolderType, loadFolder } from '@/app/lib/reports/folders';
import { isUuid } from '@/app/lib/reports/targets';

interface RouteParams {
  params: Promise<{ type: string; id: string }>;
}

/**
 * GET /api/faculty/reports/folder/:type/:id — what is inside one folder on the
 * Reports page: a section, a Patient Case, a Return Demonstration or a quiz.
 * The students and groups in it, each with the id its report is asked for by,
 * limited to the viewer's own students like the reports themselves.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { type, id } = await params;
  if (!isFolderType(type) || !isUuid(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  try {
    const supabase = getSupabaseAdmin();

    if (type === 'section') {
      const sections =
        session.role === 'faculty'
          ? await getFacultySectionIds(supabase, session.uid)
          : await getScopedSectionIds(supabase, session);
      if (sections !== null && !sections.includes(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    } else {
      const deanId = await viewerDeanId(supabase, session);
      const table = type === 'quiz' ? 'assessments' : 'scenarios';
      if (deanId && !(await ownsRow(supabase, table, id, deanId))) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
    }

    const scope = await getScopedStudentIds(supabase, session);
    const folder = await loadFolder(supabase, type, id, scope);
    if (!folder) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(folder);
  } catch (err) {
    console.error(`Report folder (${type}) failed`, err);
    return NextResponse.json({ error: 'Unable to load this folder' }, { status: 500 });
  }
}
