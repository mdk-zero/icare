import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();

    const { data: student, error } = await supabase
      .from('users')
      .select('id, email, name, role, picture_url')
      .eq('id', id)
      .eq('role', 'student')
      .maybeSingle();

    if (error) {
      console.error('Failed to fetch student detail', error);
      return NextResponse.json({ error: 'Unable to fetch student' }, { status: 500 });
    }

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Faculty can only view students in their roster.
    if (session.role === 'faculty') {
      const { data: rosterRow } = await supabase
        .from('faculty_students')
        .select('id')
        .eq('faculty_id', session.uid)
        .eq('student_id', id)
        .maybeSingle();

      if (!rosterRow) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }

    return NextResponse.json({ student });
  } catch (err) {
    console.error('Fetch student detail failed', err);
    return NextResponse.json({ error: 'Unable to fetch student' }, { status: 500 });
  }
}
