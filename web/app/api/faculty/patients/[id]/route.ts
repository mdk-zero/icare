import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/** Newest-first caps per section; a chart view reads recent history, not all of it. */
const VITALS_LIMIT = 100;
const RECORDS_LIMIT = 50;
const EVENTS_LIMIT = 50;

/** Admission-lifecycle actions worth a line on the patient's timeline. */
const TIMELINE_ACTIONS = ['patient.create', 'patient.check_in', 'patient.check_out'];

/**
 * One patient's whole chart: demographics, the vitals trend, TPR/IVF/notes,
 * and the admission timeline. Assembled server-side so the dashboard opens on
 * a single round trip instead of five, each of which would re-authenticate.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  if (!id) return NextResponse.json({ error: 'Patient ID is required' }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();

    const { data: patient, error: patientError } = await supabase
      .from('patients')
      .select(
        'id, subject_id, hadm_id, name, age, gender, room_number, room_id, room:rooms(id, name, room_number), diagnosis, admission_date, status, discharged_at, mimic_id, medical_history, vital_signs, labs, created_at',
      )
      .eq('id', id)
      .maybeSingle();

    if (patientError) {
      console.error('Failed to fetch patient', patientError);
      return NextResponse.json({ error: 'Unable to load patient' }, { status: 500 });
    }
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    const [vitals, tpr, ivf, notes, auditRows] = await Promise.all([
      supabase
        .from('vital_sign_readings')
        .select('*, users(name, email)')
        .eq('patient_id', id)
        .order('recorded_at', { ascending: false })
        .limit(VITALS_LIMIT),
      supabase
        .from('tpr_records')
        .select('*, users!tpr_records_recorded_by_fkey(id, name, email, picture_url, sex)')
        .eq('patient_id', id)
        .order('created_at', { ascending: false })
        .limit(RECORDS_LIMIT),
      supabase
        .from('ivf_records')
        .select('*, users!ivf_records_recorded_by_fkey(id, name, email, picture_url, sex)')
        .eq('patient_id', id)
        .order('created_at', { ascending: false })
        .limit(RECORDS_LIMIT),
      supabase
        .from('progress_notes')
        .select('*, users!progress_notes_author_id_fkey(id, name, email, picture_url, sex)')
        .eq('patient_id', id)
        .order('created_at', { ascending: false })
        .limit(RECORDS_LIMIT),
      // The patient's own admission history, whoever performed it — this is the
      // chart, not the faculty audit page, so it is not scoped to one actor.
      supabase
        .from('audit_logs')
        .select('id, actor_id, action, details, created_at')
        .eq('entity_type', 'patients')
        .eq('entity_id', id)
        .in('action', TIMELINE_ACTIONS)
        .order('created_at', { ascending: false })
        .limit(EVENTS_LIMIT),
    ]);

    // A failed section degrades to empty rather than failing the whole chart:
    // a missing IVF list should not hide the patient's vitals.
    for (const [label, result] of [
      ['vitals', vitals],
      ['tpr', tpr],
      ['ivf', ivf],
      ['notes', notes],
      ['events', auditRows],
    ] as const) {
      if (result.error) console.error(`Patient chart: ${label} query failed`, result.error);
    }

    // actor_id carries no foreign key (031), so names are resolved separately.
    const rows = auditRows.data ?? [];
    const actorIds = [...new Set(rows.map((r) => r.actor_id).filter((v): v is string => !!v))];
    const actorNames = new Map<string, string>();
    if (actorIds.length > 0) {
      const { data: actors } = await supabase.from('users').select('id, name').in('id', actorIds);
      for (const actor of actors ?? []) actorNames.set(actor.id, actor.name);
    }

    // Only a discharged patient has summaries, so the admitted majority never
    // pays for this query.
    let dischargeSummaries: unknown[] = [];
    if (patient.status === 'discharged') {
      const { data, error } = await supabase
        .from('discharge_summaries')
        .select(
          'id, patient_id, admitted_at, discharged_at, diagnosis, room_label, vitals_digest, ehr_digest, follow_up, ai_model, ai_generated_at, created_at',
        )
        .eq('patient_id', id)
        .order('discharged_at', { ascending: false })
        .limit(10);
      if (error) console.error('Patient chart: discharge summaries query failed', error);
      dischargeSummaries = data ?? [];
    }

    const events = rows.map((row) => ({
      id: row.id,
      action: row.action,
      created_at: row.created_at,
      actor_name: row.actor_id ? (actorNames.get(row.actor_id) ?? 'Unknown') : 'System',
      details: (row.details ?? {}) as Record<string, unknown>,
    }));

    return NextResponse.json({
      patient,
      vitals: vitals.data ?? [],
      tpr: tpr.data ?? [],
      ivf: ivf.data ?? [],
      notes: notes.data ?? [],
      events,
      discharge_summaries: dischargeSummaries,
    });
  } catch (err) {
    console.error('Fetch patient chart failed', err);
    return NextResponse.json({ error: 'Unable to load patient' }, { status: 500 });
  }
}
