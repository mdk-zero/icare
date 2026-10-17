import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { viewerDeanId } from '@/app/lib/dean-scope';

const TABLES = { tpr: 'tpr_records', ivf: 'ivf_records', note: 'progress_notes' } as const;
type EhrType = keyof typeof TABLES;

function isEhrType(value: unknown): value is EhrType {
  return value === 'tpr' || value === 'ivf' || value === 'note';
}

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const type = params.get('type');
  const patientId = params.get('patient_id');
  const studentId = params.get('student_id');
  if (!isEhrType(type)) {
    return NextResponse.json({ error: 'type must be tpr, ivf, or note' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const ownerColumn = type === 'note' ? 'author_id' : 'recorded_by';
    // Records on the viewer's Dean's patients only (077).
    const deanId = await viewerDeanId(supabase, session);
    const patientEmbed = deanId ? 'patients!inner(name, room_number)' : 'patients(name, room_number)';
    let query = supabase
      .from(TABLES[type])
      .select(`*, ${patientEmbed}, users!` + `${TABLES[type]}_${ownerColumn}_fkey(name, email)`)
      .order('created_at', { ascending: false })
      .limit(200);
    if (deanId) query = query.eq('patients.admin_id', deanId);
    if (patientId) query = query.eq('patient_id', patientId);
    if (studentId) query = query.eq(ownerColumn, studentId);

    const { data: records, error } = await query;
    if (error) {
      console.error('Failed to fetch EHR records', error);
      return NextResponse.json({ error: 'Unable to fetch records' }, { status: 500 });
    }
    return NextResponse.json({ records: records ?? [] });
  } catch (err) {
    console.error('Fetch instructor EHR records failed', err);
    return NextResponse.json({ error: 'Unable to fetch records' }, { status: 500 });
  }
}

/** Faculty sign-off on a progress note ("Validate Student Performance"). */
export async function PATCH(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { note_id } = body as { note_id?: unknown };
  if (typeof note_id !== 'string' || note_id.length === 0) {
    return NextResponse.json({ error: 'note_id is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    // A note on one of the viewer's Dean's patients (077).
    const deanId = await viewerDeanId(supabase, session);
    if (deanId) {
      const { data: target } = await supabase
        .from('progress_notes')
        .select('id, patients!inner(admin_id)')
        .eq('id', note_id)
        .eq('patients.admin_id', deanId)
        .maybeSingle();
      if (!target) return NextResponse.json({ error: 'Unreviewed note not found' }, { status: 404 });
    }
    const { data: note, error } = await supabase
      .from('progress_notes')
      .update({ reviewed_by: session.uid, reviewed_at: new Date().toISOString() })
      .eq('id', note_id)
      .is('reviewed_at', null)
      .select('id, author_id, patient_id, patients(name)')
      .single();

    if (error || !note) {
      return NextResponse.json({ error: 'Unreviewed note not found' }, { status: 404 });
    }

    await logAudit(
      session,
      { action: 'ehr.note.review', entityType: 'progress_notes', entityId: note.id },
      request,
    );

    const patientName =
      (note as unknown as { patients: { name: string } | null }).patients?.name ?? 'a patient';
    const { error: notifyError } = await supabase.from('notifications').insert({
      user_id: note.author_id,
      type: 'performance_validated',
      title: 'Progress note reviewed',
      body: `Your instructor reviewed your progress note for ${patientName}.`,
      data: { note_id: note.id, patient_id: note.patient_id },
    });
    if (notifyError) console.error('Failed to create note review notification', notifyError);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Review note failed', err);
    return NextResponse.json({ error: 'Unable to review note' }, { status: 500 });
  }
}
