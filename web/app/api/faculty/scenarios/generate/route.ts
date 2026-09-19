import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';
import { readLessonUpload } from '@/app/lib/ai/lesson';
import {
  buildScenarioPrompt,
  fetchPatientContext,
  sanitizeScenario,
  type PatientContext,
} from '@/app/lib/ai/scenario';

// Parsing a lesson file and sending up to 15k characters of it to the model
// can outrun the default budget.
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

  // A prompt alone arrives as JSON; an attached lesson turns it into multipart.
  let prompt = '';
  let patientId = '';
  let lessonFile: File | null = null;
  if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
    }
    prompt = String(formData.get('prompt') ?? '').trim();
    patientId = String(formData.get('patient_id') ?? '').trim();
    const file = formData.get('file');
    if (file instanceof File && file.size > 0) lessonFile = file;
  } else {
    let body: { prompt?: string; patient_id?: string };
    try {
      body = (await request.json()) as { prompt?: string; patient_id?: string };
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
    patientId = typeof body.patient_id === 'string' ? body.patient_id.trim() : '';
  }

  if (!prompt && !lessonFile) {
    return NextResponse.json({ error: 'Describe the case or attach a lesson' }, { status: 400 });
  }

  let lessonText: string | null = null;
  if (lessonFile) {
    const lesson = await readLessonUpload(lessonFile);
    if ('error' in lesson) {
      return NextResponse.json({ error: lesson.error }, { status: lesson.status });
    }
    lessonText = lesson.text;
  }

  try {
    const supabase = getSupabaseAdmin();
    let patient: PatientContext | null = null;
    if (patientId) {
      patient = await fetchPatientContext(supabase, patientId);
    }

    const generated = await callAI(buildScenarioPrompt(prompt, patient, lessonText));
    const scenario = sanitizeScenario(generated);

    return NextResponse.json({ scenario });
  } catch (err) {
    console.error('Generate AI scenario failed', err);
    const { error, status } = aiErrorResponse(err, 'scenario');
    return NextResponse.json({ error }, { status });
  }
}
