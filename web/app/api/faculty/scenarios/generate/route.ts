import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';
import { MAX_LESSON_CHARS } from '@/app/lib/ai/lesson';
import { listCategories, matchCategory } from '@/app/lib/scenario-categories';
import {
  buildScenarioPrompt,
  fetchPatientContext,
  sanitizeScenario,
  type PatientContext,
} from '@/app/lib/ai/scenario';

// A prompt carrying up to 15k characters of lesson can outrun the default budget.
export const maxDuration = 60;

function isFacultyOrAdmin(role: string | undefined): boolean {
  return role === 'faculty' || role === 'admin';
}

function invalidSessionResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function forbiddenResponse() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return invalidSessionResponse();
  if (!isFacultyOrAdmin(session.role)) return forbiddenResponse();

  // lesson_text is what POST analyze-lesson extracted from the uploaded file;
  // category, when set, is the lesson topic the case must centre on.
  let body: { prompt?: unknown; patient_id?: unknown; lesson_text?: unknown; category?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const patientId = typeof body.patient_id === 'string' ? body.patient_id.trim() : '';
  const lessonText =
    typeof body.lesson_text === 'string' ? body.lesson_text.trim().slice(0, MAX_LESSON_CHARS) : '';
  const requestedCategory = typeof body.category === 'string' ? body.category.trim() : '';

  if (!prompt && !lessonText) {
    return NextResponse.json({ error: 'Describe the case or attach a lesson' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    let patient: PatientContext | null = null;
    if (patientId) {
      patient = await fetchPatientContext(supabase, patientId);
    }

    const categories = await listCategories(supabase);
    const category = requestedCategory ? matchCategory(categories, requestedCategory) : null;

    const generated = await callAI(
      buildScenarioPrompt(prompt, patient, { lessonText: lessonText || null, category, categories }),
    );
    const scenario = sanitizeScenario(generated, categories);
    // The category the faculty chose wins over whatever the model labelled it.
    if (category) scenario.category = category;

    return NextResponse.json({ scenario });
  } catch (err) {
    console.error('Generate AI scenario failed', err);
    const { error, status } = aiErrorResponse(err, 'scenario');
    return NextResponse.json({ error }, { status });
  }
}
