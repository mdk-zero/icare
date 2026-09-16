import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { resolveRoom, roomCapacityError } from '@/app/lib/patient-rooms';
import { logAudit } from '@/app/lib/audit';
import { buildStayDigest } from '@/app/lib/discharge';

/**
 * Patient check-in / check-out.
 *
 * Check-out marks an admitted patient discharged and frees the bed
 * (room_id/room_number cleared — capacity counts admitted patients only).
 * Check-in re-admits a discharged patient with a fresh admission_date and,
 * optionally, a room. Creating a patient (POST /api/faculty/patients) is the
 * first check-in, so this route only ever transitions an existing row.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { id?: unknown; action?: unknown; room_id?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const action = body.action;
  const roomId =
    typeof body.room_id === 'string' && body.room_id.trim() ? body.room_id.trim() : null;

  if (!id) return NextResponse.json({ error: 'Patient ID is required' }, { status: 400 });
  if (action !== 'check_in' && action !== 'check_out') {
    return NextResponse.json({ error: 'action must be check_in or check_out' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('patients')
      .select('id, name, status, room_number, diagnosis, admission_date')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    if (action === 'check_out') {
      if (existing.status === 'discharged') {
        return NextResponse.json({ error: `${existing.name} is already checked out` }, { status: 409 });
      }

      const { data: patient, error } = await supabase
        .from('patients')
        .update({
          status: 'discharged',
          discharged_at: new Date().toISOString(),
          discharged_by: session.uid,
          room_id: null,
          room_number: '',
        })
        .eq('id', id)
        .select('*')
        .single();

      if (error) {
        console.error('Failed to check out patient', error);
        return NextResponse.json({ error: 'Unable to check out patient' }, { status: 500 });
      }

      // Materialise the stay before anything else can edit it. Fire-and-forget
      // in spirit: a digest failure is logged but never fails the discharge,
      // which has already been written.
      let summaryId: string | null = null;
      try {
        const digest = await buildStayDigest(supabase, id, existing.admission_date ?? null);
        const { data: summary, error: summaryError } = await supabase
          .from('discharge_summaries')
          .insert({
            patient_id: id,
            created_by: session.uid,
            admitted_at: existing.admission_date ?? null,
            discharged_at: patient.discharged_at,
            diagnosis: existing.diagnosis ?? '',
            room_label: existing.room_number ?? '',
            vitals_digest: digest.vitals,
            ehr_digest: digest.ehr,
          })
          .select('id')
          .single();
        if (summaryError) console.error('discharge summary insert failed', summaryError);
        summaryId = summary?.id ?? null;
      } catch (err) {
        console.error('discharge summary build failed', err);
      }

      await logAudit(
        session,
        {
          action: 'patient.check_out',
          entityType: 'patients',
          entityId: id,
          details: {
            name: existing.name,
            from_room: existing.room_number || null,
            discharge_summary_id: summaryId,
          },
        },
        request,
      );

      return NextResponse.json({ patient, discharge_summary_id: summaryId });
    }

    // check_in
    if (existing.status !== 'discharged') {
      return NextResponse.json({ error: `${existing.name} is already checked in` }, { status: 409 });
    }

    if (roomId) {
      const capacityError = await roomCapacityError(supabase, roomId, id);
      if (capacityError) return NextResponse.json({ error: capacityError }, { status: 409 });
    }
    const room = await resolveRoom(supabase, roomId);

    const { data: patient, error } = await supabase
      .from('patients')
      .update({
        status: 'admitted',
        // Re-admission starts a new stay; the old stay's dates live on in the
        // audit trail (and, later, the discharge summary).
        admission_date: new Date().toISOString(),
        discharged_at: null,
        discharged_by: null,
        room_id: room.room_id,
        room_number: room.room_number,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('Failed to check in patient', error);
      return NextResponse.json({ error: 'Unable to check in patient' }, { status: 500 });
    }

    await logAudit(
      session,
      {
        action: 'patient.check_in',
        entityType: 'patients',
        entityId: id,
        details: { name: existing.name, to_room: room.room_number || null },
      },
      request,
    );

    return NextResponse.json({ patient });
  } catch (err) {
    console.error('Patient admission action failed', err);
    return NextResponse.json({ error: 'Unable to update admission status' }, { status: 500 });
  }
}
