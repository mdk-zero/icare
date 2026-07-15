import { NextResponse, type NextRequest } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { evaluateVitals, VITAL_RULES, type VitalSignsInput } from '@/app/lib/vitals/rules';
import { isPatientAssigned } from '@/app/lib/assigned-patients';

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const patientId = request.nextUrl.searchParams.get('patient_id');

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('vital_sign_readings')
      .select('*, patients(name, room_number)')
      .eq('recorded_by', session.uid)
      .order('recorded_at', { ascending: false })
      .limit(100);
    if (patientId) query = query.eq('patient_id', patientId);

    const { data: readings, error } = await query;
    if (error) {
      console.error('Failed to fetch vital readings', error);
      return NextResponse.json({ error: 'Unable to fetch readings' }, { status: 500 });
    }

    return NextResponse.json({ readings: readings ?? [] });
  } catch (err) {
    console.error('Fetch vital readings failed', err);
    return NextResponse.json({ error: 'Unable to fetch readings' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { patient_id, notes, ...rest } = body as Record<string, unknown>;

  if (typeof patient_id !== 'string' || patient_id.length === 0) {
    return NextResponse.json({ error: 'patient_id is required' }, { status: 400 });
  }

  // Validate each vital against its hard input bounds (mirrors DB checks).
  const vitals: VitalSignsInput = {};
  for (const rule of VITAL_RULES) {
    const raw = rest[rule.field];
    if (raw === null || raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (Number.isNaN(value) || value < rule.min || value > rule.max) {
      return NextResponse.json(
        { error: `${rule.label} must be between ${rule.min} and ${rule.max}` },
        { status: 400 },
      );
    }
    vitals[rule.field] = value;
  }
  const rawPain = rest.pain_score;
  if (rawPain !== null && rawPain !== undefined && rawPain !== '') {
    const pain = Number(rawPain);
    if (!Number.isInteger(pain) || pain < 0 || pain > 10) {
      return NextResponse.json({ error: 'Pain score must be an integer between 0 and 10' }, { status: 400 });
    }
    vitals.pain_score = pain;
  }

  if (Object.keys(vitals).length === 0) {
    return NextResponse.json({ error: 'At least one vital sign is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select('id, name')
      .eq('id', patient_id)
      .single();
    if (patientError || !patient) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    // Students may only chart on patients from their assigned scenarios.
    if (!(await isPatientAssigned(supabase, session.uid, patient_id))) {
      return NextResponse.json(
        { error: 'This patient is not part of any scenario assigned to you' },
        { status: 403 },
      );
    }

    const evaluation = evaluateVitals(vitals);

    const { data: reading, error } = await supabase
      .from('vital_sign_readings')
      .insert({
        patient_id,
        recorded_by: session.uid,
        heart_rate: vitals.heart_rate ?? null,
        bp_systolic: vitals.bp_systolic ?? null,
        bp_diastolic: vitals.bp_diastolic ?? null,
        temperature_c: vitals.temperature_c ?? null,
        respiratory_rate: vitals.respiratory_rate ?? null,
        oxygen_saturation: vitals.oxygen_saturation ?? null,
        pain_score: vitals.pain_score ?? null,
        notes: typeof notes === 'string' && notes.trim() ? notes.trim() : null,
        is_anomaly: evaluation.is_anomaly,
        anomaly_reasons: evaluation.reasons,
      })
      .select()
      .single();

    if (error || !reading) {
      console.error('Failed to insert vital reading', error);
      return NextResponse.json({ error: 'Unable to save reading' }, { status: 500 });
    }

    await logAudit(
      session,
      {
        action: 'vitals.encode',
        entityType: 'vital_sign_readings',
        entityId: reading.id,
        details: {
          patient_id,
          is_anomaly: evaluation.is_anomaly,
          reasons: evaluation.reasons.map((r) => r.message),
        },
      },
      request,
    );

    if (evaluation.is_anomaly) {
      await notifyRosterFaculty(session.uid, patient.name, reading.id, patient_id, evaluation.reasons.length);
    }

    return NextResponse.json(
      { reading, is_anomaly: evaluation.is_anomaly, anomaly_reasons: evaluation.reasons },
      { status: 201 },
    );
  } catch (err) {
    console.error('Create vital reading failed', err);
    return NextResponse.json({ error: 'Unable to save reading' }, { status: 500 });
  }
}

/**
 * Alert every faculty member with this student on their roster. In-app rows
 * only for now; FCM push delivery is layered on in Phase 2.9.
 * Fire-and-forget: notification failures never fail the reading itself.
 */
async function notifyRosterFaculty(
  studentId: string,
  patientName: string,
  readingId: string,
  patientId: string,
  reasonCount: number,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();

    const [{ data: roster }, { data: student }] = await Promise.all([
      supabase.from('faculty_students').select('faculty_id').eq('student_id', studentId),
      supabase.from('users').select('name').eq('id', studentId).single(),
    ]);
    if (!roster || roster.length === 0) return;

    const studentName = student?.name ?? 'A student';
    const rows = roster.map(({ faculty_id }) => ({
      user_id: faculty_id,
      type: 'vitals_anomaly',
      title: 'Anomalous vital signs recorded',
      body: `${studentName} recorded ${reasonCount} out-of-range vital${reasonCount === 1 ? '' : 's'} for ${patientName}`,
      data: { reading_id: readingId, patient_id: patientId, student_id: studentId },
    }));

    const { error } = await supabase.from('notifications').insert(rows);
    if (error) console.error('vitals anomaly notification insert failed', error);
  } catch (err) {
    console.error('vitals anomaly notification failed', err);
  }
}
