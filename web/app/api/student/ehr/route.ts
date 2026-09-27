import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { isPatientAssigned } from '@/app/lib/assigned-patients';

// Simulated EHR documentation (manuscript F4): TPR sheet, IVF sheet,
// progress notes. One route handles all three record types.

const TABLES = { tpr: 'tpr_records', ivf: 'ivf_records', note: 'progress_notes' } as const;
type EhrType = keyof typeof TABLES;

function isEhrType(value: unknown): value is EhrType {
  return value === 'tpr' || value === 'ivf' || value === 'note';
}

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const type = params.get('type');
  const patientId = params.get('patient_id');
  if (!isEhrType(type)) {
    return NextResponse.json({ error: 'type must be tpr, ivf, or note' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const ownerColumn = type === 'note' ? 'author_id' : 'recorded_by';
    let query = supabase
      .from(TABLES[type])
      .select('*, patients(name, room_number)')
      .eq(ownerColumn, session.uid)
      .order('created_at', { ascending: false })
      .limit(100);
    if (patientId) query = query.eq('patient_id', patientId);

    const { data: records, error } = await query;
    if (error) {
      console.error('Failed to fetch EHR records', error);
      return NextResponse.json({ error: 'Unable to fetch records' }, { status: 500 });
    }
    return NextResponse.json({ records: records ?? [] });
  } catch (err) {
    console.error('Fetch EHR records failed', err);
    return NextResponse.json({ error: 'Unable to fetch records' }, { status: 500 });
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

  const { type, patient_id, ...rest } = body as Record<string, unknown>;
  if (!isEhrType(type)) {
    return NextResponse.json({ error: 'type must be tpr, ivf, or note' }, { status: 400 });
  }
  if (typeof patient_id !== 'string' || patient_id.length === 0) {
    return NextResponse.json({ error: 'patient_id is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: patient } = await supabase
      .from('patients')
      .select('id')
      .eq('id', patient_id)
      .single();
    if (!patient) return NextResponse.json({ error: 'Patient not found' }, { status: 404 });

    // Students may only chart on patients from their assigned scenarios.
    if (!(await isPatientAssigned(supabase, session.uid, patient_id))) {
      return NextResponse.json(
        { error: 'This patient is not part of any scenario assigned to you' },
        { status: 403 },
      );
    }

    let row: Record<string, unknown>;
    if (type === 'tpr') {
      const temperature = rest.temperature_c === '' || rest.temperature_c == null ? null : Number(rest.temperature_c);
      const pulse = rest.pulse === '' || rest.pulse == null ? null : Number(rest.pulse);
      const respiration = rest.respiration === '' || rest.respiration == null ? null : Number(rest.respiration);
      if (temperature === null && pulse === null && respiration === null) {
        return NextResponse.json({ error: 'At least one of temperature, pulse, respiration is required' }, { status: 400 });
      }
      if ([temperature, pulse, respiration].some((v) => v !== null && Number.isNaN(v))) {
        return NextResponse.json({ error: 'TPR values must be numeric' }, { status: 400 });
      }
      row = {
        patient_id,
        recorded_by: session.uid,
        shift: typeof rest.shift === 'string' && rest.shift.trim() ? rest.shift.trim() : null,
        temperature_c: temperature,
        pulse,
        respiration,
        remarks: typeof rest.remarks === 'string' && rest.remarks.trim() ? rest.remarks.trim() : null,
      };
    } else if (type === 'ivf') {
      if (typeof rest.solution !== 'string' || rest.solution.trim().length === 0) {
        return NextResponse.json({ error: 'IVF solution is required' }, { status: 400 });
      }
      const volume = rest.volume_ml === '' || rest.volume_ml == null ? null : Number(rest.volume_ml);
      const rate = rest.rate_ml_hr === '' || rest.rate_ml_hr == null ? null : Number(rest.rate_ml_hr);
      if ((volume !== null && (Number.isNaN(volume) || volume <= 0)) || (rate !== null && (Number.isNaN(rate) || rate <= 0))) {
        return NextResponse.json({ error: 'Volume and rate must be positive numbers' }, { status: 400 });
      }
      row = {
        patient_id,
        recorded_by: session.uid,
        solution: rest.solution.trim(),
        volume_ml: volume,
        rate_ml_hr: rate,
        site: typeof rest.site === 'string' && rest.site.trim() ? rest.site.trim() : null,
        remarks: typeof rest.remarks === 'string' && rest.remarks.trim() ? rest.remarks.trim() : null,
      };
    } else {
      if (typeof rest.content !== 'string' || rest.content.trim().length === 0) {
        return NextResponse.json({ error: 'Note content is required' }, { status: 400 });
      }
      row = {
        patient_id,
        author_id: session.uid,
        content: rest.content.trim(),
        structured: rest.structured && typeof rest.structured === 'object' ? rest.structured : {},
      };
    }

    const { data: record, error } = await supabase
      .from(TABLES[type])
      .insert(row)
      .select('*, patients(name, room_number)')
      .single();

    if (error || !record) {
      console.error('Failed to insert EHR record', error);
      return NextResponse.json({ error: 'Unable to save record' }, { status: 500 });
    }

    await logAudit(
      session,
      { action: `ehr.${type}.create`, entityType: TABLES[type], entityId: record.id, details: { patient_id } },
      request,
    );

    return NextResponse.json({ record }, { status: 201 });
  } catch (err) {
    console.error('Create EHR record failed', err);
    return NextResponse.json({ error: 'Unable to save record' }, { status: 500 });
  }
}

/** Students can update the status of their own IVF records (complete/discontinue). */
export async function PATCH(request: NextRequest) {
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

  const { id, status } = body as { id?: unknown; status?: unknown };
  if (typeof id !== 'string' || id.length === 0) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 });
  }
  if (status !== 'completed' && status !== 'discontinued') {
    return NextResponse.json({ error: 'status must be completed or discontinued' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: record, error } = await supabase
      .from('ivf_records')
      .update({ status, ended_at: new Date().toISOString() })
      .eq('id', id)
      .eq('recorded_by', session.uid)
      .eq('status', 'ongoing')
      .select('*, patients(name, room_number)')
      .single();

    if (error || !record) {
      return NextResponse.json({ error: 'Ongoing IVF record not found' }, { status: 404 });
    }

    await logAudit(
      session,
      { action: 'ehr.ivf.status', entityType: 'ivf_records', entityId: record.id, details: { status } },
      request,
    );

    return NextResponse.json({ record });
  } catch (err) {
    console.error('Update IVF record failed', err);
    return NextResponse.json({ error: 'Unable to update record' }, { status: 500 });
  }
}
