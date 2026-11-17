import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { loadStudentCases } from '@/app/lib/student-cases';

// GET /api/student/cases — the case presentations the student's groups report.
export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  try {
    // Before 056 there is nothing to show, not an error for the student.
    return NextResponse.json({ cases: await loadStudentCases(getSupabaseAdmin(), session.uid) });
  } catch (err) {
    console.error('Failed to list student cases', err);
    return NextResponse.json({ error: 'Unable to load your cases' }, { status: 500 });
  }
}
