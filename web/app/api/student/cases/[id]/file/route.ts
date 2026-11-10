import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { getStudentSupervisorIds } from '@/app/lib/roster';
import { loadStudentCase, removeCaseFiles, signedCaseFile, CASES_NOT_READY } from '@/app/lib/cases';
import { CASE_BUCKET, caseFileTypeOf, MAX_CASE_FILE_BYTES } from '@/app/lib/case-rubric';
import { insertNotifications } from '@/app/lib/notify';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/student/cases/:id/file — a short-lived link to the group's slides,
// for any member.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadStudentCase(supabase, session.uid, id);
    if (loaded.missing === 'not_ready') return NextResponse.json({ error: CASES_NOT_READY }, { status: 503 });
    if (loaded.missing || !loaded.row) return NextResponse.json({ error: 'Case presentation not found' }, { status: 404 });
    const file = await signedCaseFile(supabase, loaded.row);
    if (!file) return NextResponse.json({ error: 'Your group has not uploaded its slides yet' }, { status: 404 });
    return NextResponse.json(file);
  } catch (err) {
    console.error('Failed to sign a case file', err);
    return NextResponse.json({ error: 'Unable to open the slides' }, { status: 500 });
  }
}

// POST /api/student/cases/:id/file { path, file_name, file_size, mime }
// The leader hands in what they uploaded. It replaces an earlier upload, and
// counts as handed in for the whole group. Late is allowed — it is flagged,
// never blocked.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const path = typeof body.path === 'string' ? body.path : '';
  const fileName = typeof body.file_name === 'string' ? body.file_name.trim().slice(0, 200) : '';
  const mime = typeof body.mime === 'string' ? body.mime : '';
  const size = Number(body.file_size);
  const type = caseFileTypeOf(mime, fileName);
  if (!type) return NextResponse.json({ error: 'Upload a PowerPoint (.pptx) or PDF file' }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadStudentCase(supabase, session.uid, id);
    if (loaded.missing === 'not_ready') return NextResponse.json({ error: CASES_NOT_READY }, { status: 503 });
    if (loaded.missing || !loaded.group || !loaded.row) {
      return NextResponse.json({ error: 'Case presentation not found' }, { status: 404 });
    }
    const { group, row, presentation } = loaded;
    if (group.leader_id !== session.uid) {
      return NextResponse.json({ error: 'Only your group leader can upload the slides' }, { status: 403 });
    }
    if (group.status === 'graded') {
      return NextResponse.json({ error: 'Your group has been graded; the slides can no longer change' }, { status: 409 });
    }
    // Only a file uploaded for this group, through upload-url.
    if (!path.startsWith(`${group.id}/`) || path.includes('..')) {
      return NextResponse.json({ error: 'Upload the file again' }, { status: 400 });
    }
    const { data: stored } = await supabase.storage.from(CASE_BUCKET).list(group.id, { search: path.slice(group.id.length + 1) });
    if (!(stored ?? []).some((f) => `${group.id}/${f.name}` === path)) {
      return NextResponse.json({ error: 'The upload did not finish. Try again.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const { data: updated, error } = await supabase
      .from('case_presentation_groups')
      .update({
        file_path: path,
        file_name: fileName || `slides.${type}`,
        file_size: Number.isFinite(size) && size > 0 ? Math.min(Math.round(size), MAX_CASE_FILE_BYTES) : null,
        file_type: type,
        uploaded_by: session.uid,
        status: 'submitted',
        submitted_at: now,
      })
      .eq('id', group.id)
      .neq('status', 'graded')
      .select('id')
      .maybeSingle();
    if (error) throw error;
    if (!updated) {
      return NextResponse.json({ error: 'Your group has been graded; the slides can no longer change' }, { status: 409 });
    }
    // Each member's record shows it handed in too.
    const { error: mirrorError } = await supabase
      .from('case_submissions')
      .update({ status: 'submitted', submitted_at: now })
      .eq('group_id', group.id)
      .neq('status', 'graded');
    if (mirrorError) throw mirrorError;
    if (row.file_path && row.file_path !== path) await removeCaseFiles(supabase, [row.file_path]);

    // The first hand-in tells the instructor and the rest of the group; a
    // replacement only the group.
    const replaced = !!row.file_path;
    const recipients = new Set(await getStudentSupervisorIds(supabase, session.uid));
    if (presentation.created_by) recipients.add(presentation.created_by);
    const { data: leader } = await supabase.from('users').select('name').eq('id', session.uid).single();
    const notes = [
      ...(replaced
        ? []
        : [...recipients].map((user_id) => ({
            user_id,
            type: 'system' as const,
            title: 'Case presentation handed in',
            body: `${group.name} (${group.section_name}) handed in their slides for "${presentation.title}".`,
            data: { case_presentation_id: presentation.id, case_group_id: group.id },
          }))),
      ...group.members
        .filter((m) => m.student_id !== session.uid)
        .map((m) => ({
          user_id: m.student_id,
          type: 'system' as const,
          title: replaced ? 'Group slides updated' : 'Group slides uploaded',
          body: `${leader?.name ?? 'Your group leader'} ${replaced ? 'replaced' : 'uploaded'} your group's slides for "${presentation.title}". Open them to review.`,
          data: { case_submission_id: m.submission_id, case_presentation_id: presentation.id },
        })),
    ];
    if (notes.length > 0) {
      const { error: notifyError } = await insertNotifications(supabase, notes);
      if (notifyError) console.error('Failed to notify about case slides', notifyError);
    }

    await logAudit(
      session,
      {
        action: 'case.submit',
        entityType: 'case_presentation_groups',
        entityId: group.id,
        details: { presentation_id: presentation.id, file_name: fileName, replaced },
      },
      request,
    );

    return NextResponse.json({ ok: true, submitted_at: now });
  } catch (err) {
    console.error('Failed to hand in case slides', err);
    return NextResponse.json({ error: 'Unable to hand in the slides' }, { status: 500 });
  }
}
