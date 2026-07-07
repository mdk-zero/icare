import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

/**
 * At-risk predictions written by the ML service (Phase 3.5/3.8).
 * ?student_id=... returns the latest prediction for one student;
 * without it, the latest prediction per student (for roster badges).
 */
export async function GET(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const studentId = request.nextUrl.searchParams.get('student_id');

  try {
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('performance_predictions')
      .select('id, student_id, risk, probability, features, explanations, predicted_at, ml_models(kind, version, is_baseline)')
      .order('predicted_at', { ascending: false });
    if (studentId) query = query.eq('student_id', studentId).limit(1);
    else query = query.limit(2000);

    const { data, error } = await query;
    if (error) {
      console.error('Failed to fetch predictions', error);
      return NextResponse.json({ error: 'Unable to fetch predictions' }, { status: 500 });
    }

    if (studentId) {
      return NextResponse.json({ prediction: data?.[0] ?? null });
    }

    // keep only the newest row per student
    const latest = new Map<string, (typeof data)[number]>();
    for (const row of data ?? []) {
      if (!latest.has(row.student_id)) latest.set(row.student_id, row);
    }
    return NextResponse.json({ predictions: [...latest.values()] });
  } catch (err) {
    console.error('Fetch predictions failed', err);
    return NextResponse.json({ error: 'Unable to fetch predictions' }, { status: 500 });
  }
}
