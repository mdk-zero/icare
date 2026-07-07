import { NextResponse, type NextRequest } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const params = request.nextUrl.searchParams;
  const flaggedOnly = params.get('flagged') === 'true';
  const patientId = params.get('patient_id');
  const studentId = params.get('student_id');

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('vital_sign_readings')
      .select('*, patients(name, room_number), users(name, email)')
      .order('recorded_at', { ascending: false })
      .limit(200);
    if (flaggedOnly) query = query.eq('is_anomaly', true);
    if (patientId) query = query.eq('patient_id', patientId);
    if (studentId) query = query.eq('recorded_by', studentId);

    const { data: readings, error } = await query;
    if (error) {
      console.error('Failed to fetch vital readings', error);
      return NextResponse.json({ error: 'Unable to fetch readings' }, { status: 500 });
    }

    return NextResponse.json({ readings: readings ?? [] });
  } catch (err) {
    console.error('Fetch faculty vital readings failed', err);
    return NextResponse.json({ error: 'Unable to fetch readings' }, { status: 500 });
  }
}
