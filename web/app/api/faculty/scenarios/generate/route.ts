import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';
import {
  buildScenarioPrompt,
  fetchPatientContext,
  sanitizeScenario,
  type PatientContext,
} from '@/app/lib/ai/scenario';

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

  let body: { prompt?: string; patient_id?: string };
  try {
    body = (await request.json()) as { prompt?: string; patient_id?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) {
    return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    let patient: PatientContext | null = null;
    if (typeof body.patient_id === 'string' && body.patient_id.trim()) {
      patient = await fetchPatientContext(supabase, body.patient_id.trim());
    }

    const generated = await callAI(buildScenarioPrompt(prompt, patient));
    const scenario = sanitizeScenario(generated);

    return NextResponse.json({ scenario });
  } catch (err) {
    console.error('Generate AI scenario failed', err);
    const { error, status } = aiErrorResponse(err, 'scenario');
    return NextResponse.json({ error }, { status });
  }
}
