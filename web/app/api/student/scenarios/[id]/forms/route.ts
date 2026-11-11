import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { formByKey, missingInRows, sanitizeRows } from '@/app/lib/return-demo-forms';
import { loadAssignmentForms } from '@/app/lib/return-demo-forms-server';
import { FORMS_NEED_MIGRATION, isMissingForms } from '@/app/lib/return-demos-server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/student/scenarios/:id/forms — the forms on the student's own Return
// Demonstration (094), with what they have entered so far.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  try {
    const loaded = await loadAssignmentForms(getSupabaseAdmin(), id);
    if (!loaded || loaded.assignment.student_id !== session.uid) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }
    return NextResponse.json({ forms: loaded.forms, locked: loaded.assignment.status === 'completed' });
  } catch (err) {
    console.error('Failed to load Return Demonstration forms', err);
    return NextResponse.json({ error: 'Unable to load the forms' }, { status: 500 });
  }
}

// POST /api/student/scenarios/:id/forms  { form_key, rows, submit? }
// Saves the rows of one form; `submit` hands it in, which needs every
// required field. Either can be done again until the instructor finalizes
// the grade.
export async function POST(request: NextRequest, { params }: RouteParams) {
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
  const formKey = typeof body.form_key === 'string' ? body.form_key : '';
  const form = formByKey(formKey);
  if (!form) return NextResponse.json({ error: 'Unknown form' }, { status: 400 });
  const rows = sanitizeRows(form, body.rows);
  const submit = body.submit === true;

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadAssignmentForms(supabase, id);
    if (!loaded || loaded.assignment.student_id !== session.uid) {
      return NextResponse.json({ error: 'Assignment not found' }, { status: 404 });
    }
    if (loaded.assignment.status === 'completed') {
      return NextResponse.json({ error: 'Your instructor has graded this, so the forms can no longer change' }, { status: 409 });
    }
    if (!loaded.forms.some((f) => f.key === form.key)) {
      return NextResponse.json({ error: 'This form is not part of your Return Demonstration' }, { status: 400 });
    }
    if (submit) {
      const missing = missingInRows(form, rows);
      if (missing) return NextResponse.json({ error: missing }, { status: 400 });
    }

    const previous = loaded.forms.find((f) => f.key === form.key);
    const { data, error } = await supabase
      .from('return_demo_form_entries')
      .upsert(
        {
          assignment_id: id,
          form_key: form.key,
          entries: rows,
          // Handing in again keeps it handed in; saving a draft of a handed-in form keeps that too.
          submitted_at: submit ? new Date().toISOString() : previous?.submitted_at ?? null,
        },
        { onConflict: 'assignment_id,form_key' },
      )
      .select('entries, submitted_at, updated_at')
      .single();
    if (error) {
      if (isMissingForms(error)) return NextResponse.json({ error: FORMS_NEED_MIGRATION }, { status: 503 });
      throw error;
    }
    return NextResponse.json({ form: { ...form, rows: data.entries, submitted_at: data.submitted_at, updated_at: data.updated_at } });
  } catch (err) {
    console.error('Failed to save Return Demonstration form', err);
    return NextResponse.json({ error: 'Unable to save the form' }, { status: 500 });
  }
}
