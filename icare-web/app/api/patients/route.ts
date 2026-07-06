import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

function invalidSessionResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return invalidSessionResponse();

  const { searchParams } = new URL(request.url);
  const search = searchParams.get('search')?.trim().toLowerCase();

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('patients')
      .select('id, subject_id, hadm_id, name, age, gender, room_number, diagnosis, admission_date, vital_signs, labs, mimic_id, medical_history, created_by, created_at')
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
