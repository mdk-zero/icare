import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import {
  assignCasePresentation,
  scopedCaseStudents,
  canManagePresentation,
  isMissingCaseTables,
  CASES_NOT_READY,
  PRESENTATION_COLUMNS,
} from '@/app/lib/cases';
import { isLateSubmission } from '@/app/lib/case-rubric';
import { parseDeadline } from '@/app/lib/deadline-input';

interface RouteParams {
  params: Promise<{ id: string }>;
}

type Presentation = {
  id: string;
  title: string;
  instructions: string;
  deadline: string | null;
  section_ids: string[];
  created_by: string | null;
};

async function authorize() {
  const session = await readSession();
  if (!session) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) } as const;
  if (!['faculty', 'admin'].includes(session.role)) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) } as const;
  }
  return { session } as const;
}

async function loadPresentation(supabase: ReturnType<typeof getSupabaseAdmin>, id: string) {
  const { data, error } = await supabase.from('case_presentations').select(PRESENTATION_COLUMNS).eq('id', id).maybeSingle();
  if (error) {
    if (isMissingCaseTables(error)) return { response: NextResponse.json({ error: CASES_NOT_READY }, { status: 503 }) };
    // A malformed id fails the query outright.
    return { response: NextResponse.json({ error: 'Case presentation not found' }, { status: 404 }) };
  }
  if (!data) return { response: NextResponse.json({ error: 'Case presentation not found' }, { status: 404 }) };
  return { presentation: data as unknown as Presentation };
}

// GET /api/faculty/cases/:id — the presentation and the caller's students on it.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const auth = await authorize();
  if ('error' in auth) return auth.error;
  const { session } = auth;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadPresentation(supabase, id);
    if (loaded.response) return loaded.response;
    const presentation = loaded.presentation;

    const scope = await scopedCaseStudents(supabase, session);
    let query = supabase
      .from('case_submissions')
      .select('id, student_id, status, patient_initials, submitted_at, graded_at, score, users!case_submissions_student_id_fkey(name, section_id)')
      .eq('presentation_id', id);
    if (scope) query = query.in('student_id', [...scope]);
    const { data: rows, error } = await query;
    if (error) throw error;

    if (scope && (rows ?? []).length === 0 && presentation.created_by !== session.uid) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: sections } = presentation.section_ids.length
      ? await supabase.from('sections').select('id, name').in('id', presentation.section_ids)
      : { data: [] as { id: string; name: string }[] };
    const sectionName = new Map((sections ?? []).map((s) => [s.id as string, s.name as string]));

    const roster = (rows ?? [])
      .map((r) => {
        const user = r.users as unknown as { name: string | null; section_id: string | null } | null;
        return {
          submission_id: r.id,
          student_id: r.student_id,
          student_name: user?.name ?? 'Unknown student',
          section_name: user?.section_id ? sectionName.get(user.section_id) ?? null : null,
          status: r.status,
          patient_initials: r.patient_initials,
          submitted_at: r.submitted_at,
          graded_at: r.graded_at,
          score: r.score === null ? null : Number(r.score),
          late: isLateSubmission(r.submitted_at as string | null, presentation.deadline),
        };
      })
      .sort((a, b) => a.student_name.localeCompare(b.student_name));

    return NextResponse.json({
      presentation: {
        ...presentation,
        sections: presentation.section_ids.map((sid) => ({ id: sid, name: sectionName.get(sid) ?? 'Unknown' })),
        can_manage: canManagePresentation(session, presentation),
      },
      roster,
    });
  } catch (err) {
    console.error('Failed to load case presentation', err);
    return NextResponse.json({ error: 'Unable to load the case presentation' }, { status: 500 });
  }
}

// PATCH /api/faculty/cases/:id  { title?, instructions?, deadline?, section_ids? }
// Adding sections gives it to the caller's students there; sections are never
// removed, since students there may already have written their case.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const auth = await authorize();
  if ('error' in auth) return auth.error;
  const { session } = auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { title, instructions, deadline, section_ids } = body as Record<string, unknown>;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadPresentation(supabase, id);
    if (loaded.response) return loaded.response;
    const presentation = loaded.presentation;
    if (!canManagePresentation(session, presentation)) {
      return NextResponse.json({ error: 'Only the instructor who created this can change it' }, { status: 403 });
    }

    const update: Record<string, unknown> = {};
    if (title !== undefined) {
      const t = typeof title === 'string' ? title.trim() : '';
      if (!t || t.length > 200) return NextResponse.json({ error: 'Title must be 1–200 characters' }, { status: 400 });
      update.title = t;
    }
    if (instructions !== undefined) {
      update.instructions = typeof instructions === 'string' ? instructions.trim().slice(0, 4000) : '';
    }
    if (deadline !== undefined) {
      // It can move, but not go: attendance is measured against it.
      const deadlineCheck = parseDeadline(deadline);
      if (!deadlineCheck.ok) return NextResponse.json({ error: deadlineCheck.error }, { status: 400 });
      update.deadline = deadlineCheck.value;
    }

    let addedSections: string[] = [];
    if (section_ids !== undefined) {
      const wanted = Array.isArray(section_ids)
        ? [...new Set(section_ids.filter((v): v is string => typeof v === 'string' && v.length > 0))]
        : [];
      addedSections = wanted.filter((sid) => !presentation.section_ids.includes(sid));
      if (addedSections.length > 0) update.section_ids = [...presentation.section_ids, ...addedSections];
    }

    let studentsAdded = 0;
    if (addedSections.length > 0) {
      const assigned = await assignCasePresentation(supabase, session, presentation, addedSections);
      if (!assigned.ok) {
        return NextResponse.json({ error: assigned.error, invalid: assigned.invalid }, { status: assigned.status });
      }
      studentsAdded = assigned.added.length;
    }

    if (Object.keys(update).length > 0) {
      const { error } = await supabase.from('case_presentations').update(update).eq('id', id);
      if (error) throw error;
      await logAudit(
        session,
        { action: 'case.update', entityType: 'case_presentations', entityId: id, details: { ...update, students_added: studentsAdded } },
        request,
      );
    }

    return NextResponse.json({ ok: true, students_added: studentsAdded });
  } catch (err) {
    console.error('Failed to update case presentation', err);
    return NextResponse.json({ error: 'Unable to update the case presentation' }, { status: 500 });
  }
}

// DELETE /api/faculty/cases/:id — only while nobody has handed a case in.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const auth = await authorize();
  if ('error' in auth) return auth.error;
  const { session } = auth;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadPresentation(supabase, id);
    if (loaded.response) return loaded.response;
    if (!canManagePresentation(session, loaded.presentation)) {
      return NextResponse.json({ error: 'Only the instructor who created this can delete it' }, { status: 403 });
    }

    const { count, error: countError } = await supabase
      .from('case_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('presentation_id', id)
      .in('status', ['submitted', 'graded']);
    if (countError) throw countError;
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: 'Students have already handed in cases for this presentation; it can no longer be deleted' },
        { status: 409 },
      );
    }

    const { error } = await supabase.from('case_presentations').delete().eq('id', id);
    if (error) throw error;

    await logAudit(
      session,
      { action: 'case.delete', entityType: 'case_presentations', entityId: id, details: { title: loaded.presentation.title } },
      request,
    );
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('Failed to delete case presentation', err);
    return NextResponse.json({ error: 'Unable to delete the case presentation' }, { status: 500 });
  }
}
