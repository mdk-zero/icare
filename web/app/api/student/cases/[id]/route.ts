import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { isMissingCaseTables, CASES_NOT_READY, SUBMISSION_COLUMNS } from '@/app/lib/cases';
import { normalizeInitials } from '@/app/lib/case-privacy';
import {
  CASE_CRITERIA,
  CASE_TEXT_FIELDS,
  isLateSubmission,
  sanitizeObservations,
} from '@/app/lib/case-rubric';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_TEXT = 4000;
const EDITABLE = new Set(['not_started', 'draft']);

type Supabase = ReturnType<typeof getSupabaseAdmin>;

async function loadOwn(supabase: Supabase, studentId: string, id: string) {
  const { data, error } = await supabase
    .from('case_submissions')
    .select(`${SUBMISSION_COLUMNS}, case_presentations!inner(id, title, instructions, deadline)`)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (isMissingCaseTables(error)) return { response: NextResponse.json({ error: CASES_NOT_READY }, { status: 503 }) };
    return { response: NextResponse.json({ error: 'Case not found' }, { status: 404 }) };
  }
  if (!data) return { response: NextResponse.json({ error: 'Case not found' }, { status: 404 }) };
  const row = data as unknown as Record<string, unknown> & { student_id: string; status: string };
  if (row.student_id !== studentId) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { row };
}

/** What the student sees: grading only once it is final. */
async function present(supabase: Supabase, row: Record<string, unknown>) {
  const { case_presentations: presentation, graded_by: _gradedBy, ...rest } = row;
  const p = presentation as { deadline: string | null };
  const graded = rest.status === 'graded';

  let ratings: { criterion: string; rating: string; remarks: string }[] = [];
  if (graded) {
    const { data } = await supabase
      .from('case_submission_ratings')
      .select('criterion, rating, remarks')
      .eq('submission_id', rest.id as string);
    ratings = data ?? [];
  }

  return {
    ...rest,
    score: graded && rest.score !== null ? Number(rest.score) : null,
    remarks: graded ? rest.remarks : '',
    late: isLateSubmission(rest.submitted_at as string | null, p.deadline),
    presentation,
    ratings,
    criteria: CASE_CRITERIA,
  };
}

// GET /api/student/cases/:id
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadOwn(supabase, session.uid, id);
    if (loaded.response) return loaded.response;
    return NextResponse.json({ case: await present(supabase, loaded.row) });
  } catch (err) {
    console.error('Failed to load student case', err);
    return NextResponse.json({ error: 'Unable to load the case' }, { status: 500 });
  }
}

// PATCH /api/student/cases/:id — save the draft. Only whitelisted fields are
// taken; the patient is named by initials only.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if ('patient_initials' in body) {
    const raw = body.patient_initials;
    if (raw === null || raw === '') update.patient_initials = null;
    else {
      const initials = typeof raw === 'string' ? normalizeInitials(raw) : null;
      if (!initials) {
        return NextResponse.json(
          { error: "Use the patient's initials only: 2–4 letters, like JD for Juan Dela Cruz" },
          { status: 400 },
        );
      }
      update.patient_initials = initials;
    }
  }
  if ('age' in body) {
    const age = body.age;
    if (age === null || age === '') update.age = null;
    else {
      const n = typeof age === 'string' ? Number(age) : age;
      if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 130) {
        return NextResponse.json({ error: 'Age must be a whole number from 0 to 130' }, { status: 400 });
      }
      update.age = n;
    }
  }
  if ('sex' in body) {
    const sex = body.sex;
    if (sex !== null && sex !== 'male' && sex !== 'female') {
      return NextResponse.json({ error: 'Sex must be male or female' }, { status: 400 });
    }
    update.sex = sex;
  }
  for (const field of CASE_TEXT_FIELDS) {
    if (field in body) {
      const value = body[field];
      update[field] = typeof value === 'string' ? value.trim().slice(0, MAX_TEXT) : '';
    }
  }
  if ('observations' in body) update.observations = sanitizeObservations(body.observations);

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadOwn(supabase, session.uid, id);
    if (loaded.response) return loaded.response;
    if (!EDITABLE.has(loaded.row.status)) {
      return NextResponse.json({ error: 'This case has been handed in and can no longer be edited' }, { status: 409 });
    }

    update.status = 'draft';
    const { data, error } = await supabase
      .from('case_submissions')
      .update(update)
      .eq('id', id)
      .in('status', [...EDITABLE])
      .select(`${SUBMISSION_COLUMNS}, case_presentations!inner(id, title, instructions, deadline)`)
      .maybeSingle();
    if (error) throw error;
    // Handed in between the read and the write.
    if (!data) {
      return NextResponse.json({ error: 'This case has been handed in and can no longer be edited' }, { status: 409 });
    }

    return NextResponse.json({ case: await present(supabase, data as unknown as Record<string, unknown>) });
  } catch (err) {
    console.error('Failed to save case draft', err);
    return NextResponse.json({ error: 'Unable to save your case' }, { status: 500 });
  }
}
