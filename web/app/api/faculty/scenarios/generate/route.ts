import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';
import { MAX_LESSON_CHARS } from '@/app/lib/ai/lesson';
import { TAYLORS_CHAPTERS } from '@/scripts/taylors-chapters';
import {
  UNCATEGORIZED,
  buildScenarioPrompt,
  fetchPatientContext,
  lessonTopics,
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
  // chapters, when set, are the Taylor's chapters the case centres on; topics
  // are lesson topics outside the book.
  let body: { prompt?: unknown; patient_id?: unknown; lesson_text?: unknown; chapters?: unknown; topics?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const patientId = typeof body.patient_id === 'string' ? body.patient_id.trim() : '';
  const lessonText =
    typeof body.lesson_text === 'string' ? body.lesson_text.trim().slice(0, MAX_LESSON_CHARS) : '';
  // Any of the book's chapters; unknown numbers are dropped.
  const chapterNumbers = Array.isArray(body.chapters) ? body.chapters.map(Number) : [];
  const chapters = TAYLORS_CHAPTERS.filter((c) => chapterNumbers.includes(c.chapter));
  const topics = lessonTopics(body.topics);

  if (!prompt && !lessonText) {
    return NextResponse.json({ error: 'Describe the case or attach a lesson' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    let patient: PatientContext | null = null;
    if (patientId) {
      patient = await fetchPatientContext(supabase, patientId);
    }

    const generated = await callAI(
      buildScenarioPrompt(prompt, patient, { lessonText: lessonText || null, chapters, topics }),
    );
    const scenario = { ...sanitizeScenario(generated), category: UNCATEGORIZED };

    return NextResponse.json({ scenario });
  } catch (err) {
    console.error('Generate AI patient case failed', err);
    const { error, status } = aiErrorResponse(err, 'scenario');
    return NextResponse.json({ error }, { status });
  }
}
