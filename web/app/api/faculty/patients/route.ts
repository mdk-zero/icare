import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

function isFacultyOrAdmin(role: string | undefined): boolean {
  return role === 'faculty' || role === 'admin';
}

function invalidSessionResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function forbiddenResponse() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

interface VitalSignsInput {
  heart_rate: number | null;
  blood_pressure: string | null;
  temperature: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
}

function parseVitalSigns(input: unknown): VitalSignsInput {
  if (!input || typeof input !== 'object') {
    return {
      heart_rate: null,
      blood_pressure: null,
      temperature: null,
      respiratory_rate: null,
      oxygen_saturation: null,
    };
  }
  const v = input as Record<string, unknown>;
  return {
    heart_rate: typeof v.heart_rate === 'number' ? v.heart_rate : null,
    blood_pressure: typeof v.blood_pressure === 'string' ? v.blood_pressure : null,
    temperature: typeof v.temperature === 'number' ? v.temperature : null,
    respiratory_rate: typeof v.respiratory_rate === 'number' ? v.respiratory_rate : null,
    oxygen_saturation: typeof v.oxygen_saturation === 'number' ? v.oxygen_saturation : null,
  };
}

function parseLabs(input: unknown): Record<string, string | number | null> {
  if (!input || typeof input !== 'object') return {};
  const labs: Record<string, string | number | null> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value === 'number' || typeof value === 'string') {
      labs[key] = value;
    } else if (value === null) {
      labs[key] = null;
    }
  }
  return labs;
}

function sanitizePatientInput(body: Record<string, unknown>): {
  name: string;
  age: number | null;
  gender: string;
  room_number: string;
  diagnosis: string;
  admission_date: string;
  vital_signs: VitalSignsInput;
  labs: Record<string, string | number | null>;
} {
  return {
    name: typeof body.name === 'string' ? body.name.trim() : '',
    age: typeof body.age === 'number' ? body.age : null,
    gender: typeof body.gender === 'string' ? body.gender.trim() : '',
    room_number: typeof body.room_number === 'string' ? body.room_number.trim() : '',
    diagnosis: typeof body.diagnosis === 'string' ? body.diagnosis.trim() : '',
    admission_date: typeof body.admission_date === 'string' ? body.admission_date : new Date().toISOString(),
    vital_signs: parseVitalSigns(body.vital_signs),
    labs: parseLabs(body.labs),
  };
}

function validateRequired(input: ReturnType<typeof sanitizePatientInput>): string | null {
  if (!input.name) return 'Patient name is required';
  if (!input.gender) return 'Gender is required';
  if (!input.diagnosis) return 'Diagnosis is required';
  if (input.age === null || input.age < 0 || input.age > 150) return 'Valid age is required';
  return null;
}

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return invalidSessionResponse();
  if (!isFacultyOrAdmin(session.role)) return forbiddenResponse();

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.trim().toLowerCase();

  try {
    const supabase = getSupabaseAdmin();
    // vital_signs and labs are read back by the edit form, which writes whatever
    // it holds — omitting them here made saving a patient blank both columns.
    let query = supabase
      .from('patients')
      .select('id, subject_id, hadm_id, name, age, gender, room_number, diagnosis, admission_date, mimic_id, medical_history, vital_signs, labs, created_at')
      .order('admission_date', { ascending: false })
      .limit(500);

    if (search) {
      query = query.or(`name.ilike.%${search}%,diagnosis.ilike.%${search}%,mimic_id.ilike.%${search}%`);
    }

    const { data: patients, error } = await query;

    if (error) {
      console.error('Failed to fetch patients', error);
      return NextResponse.json({ error: 'Unable to fetch patients' }, { status: 500 });
    }

    return NextResponse.json({ patients: patients || [] });
  } catch (err) {
    console.error('Fetch patients failed', err);
    return NextResponse.json({ error: 'Unable to fetch patients' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return invalidSessionResponse();
  if (!isFacultyOrAdmin(session.role)) return forbiddenResponse();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const input = sanitizePatientInput(body);
  const validationError = validateRequired(input);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Generate a synthetic subject_id/hadm_id for manually created patients.
    // Use a negative subject_id space so they never collide with MIMIC IDs.
    const { data: minSubject } = await supabase
      .from('patients')
      .select('subject_id')
      .lt('subject_id', 0)
      .order('subject_id', { ascending: true })
      .limit(1)
      .maybeSingle();

    const nextSubjectId = minSubject?.subject_id ? minSubject.subject_id - 1 : -1;

    const { data: patient, error: insertError } = await supabase
      .from('patients')
      .insert({
        subject_id: nextSubjectId,
        hadm_id: nextSubjectId,
        mimic_id: `ICARE-${Math.abs(nextSubjectId)}`,
        created_by: session.uid,
        ...input,
      })
      .select('*')
      .single();

    if (insertError) {
      console.error('Failed to create patient', insertError);
      return NextResponse.json({ error: 'Unable to create patient' }, { status: 500 });
    }

    return NextResponse.json({ patient }, { status: 201 });
  } catch (err) {
    console.error('Create patient failed', err);
    return NextResponse.json({ error: 'Unable to create patient' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const session = await readSession();
  if (!session) return invalidSessionResponse();
  if (!isFacultyOrAdmin(session.role)) return forbiddenResponse();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) {
    return NextResponse.json({ error: 'Patient ID is required' }, { status: 400 });
  }

  const input = sanitizePatientInput(body);
  const validationError = validateRequired(input);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: existing } = await supabase
      .from('patients')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: 'Patient not found' }, { status: 404 });
    }

    const { data: patient, error: updateError } = await supabase
      .from('patients')
      .update({
        name: input.name,
        age: input.age,
        gender: input.gender,
        room_number: input.room_number,
        diagnosis: input.diagnosis,
        admission_date: input.admission_date,
        vital_signs: input.vital_signs,
        labs: input.labs,
      })
      .eq('id', id)
      .select('*')
      .single();

    if (updateError) {
      console.error('Failed to update patient', updateError);
      return NextResponse.json({ error: 'Unable to update patient' }, { status: 500 });
    }

    return NextResponse.json({ patient });
  } catch (err) {
    console.error('Update patient failed', err);
    return NextResponse.json({ error: 'Unable to update patient' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await readSession();
  if (!session) return invalidSessionResponse();
  if (!isFacultyOrAdmin(session.role)) return forbiddenResponse();

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!id) {
    return NextResponse.json({ error: 'Patient ID is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { error: deleteError } = await supabase
      .from('patients')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('Failed to delete patient', deleteError);
      return NextResponse.json({ error: 'Unable to delete patient' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete patient failed', err);
    return NextResponse.json({ error: 'Unable to delete patient' }, { status: 500 });
  }
}
