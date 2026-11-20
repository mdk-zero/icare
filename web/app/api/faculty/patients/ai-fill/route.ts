import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';
import {
  buildPatientFillPrompt,
  cleanCondition,
  sanitizePatientFill,
  type PatientFillFixed,
} from '@/app/lib/ai/patient-fill';

export const maxDuration = 60;

function isFacultyOrAdmin(role: string | undefined): boolean {
  return role === 'faculty' || role === 'admin';
}

/**
 * POST { condition, age?, gender? } — drafts a simulated patient's admission
 * chart (age, sex, diagnosis, vital signs, labs) for the Add Patient form.
 * Nothing is saved: the form shows the draft and the instructor admits it.
 * The prompt holds only the condition and a made-up age and sex, no one's
 * record, so it can use the whole provider chain.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isFacultyOrAdmin(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { condition?: unknown; age?: unknown; gender?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const condition = cleanCondition(body.condition);
  if (condition.length < 2) {
    return NextResponse.json({ error: 'Name a condition first' }, { status: 400 });
  }
  const fixed: PatientFillFixed = {};
  if (typeof body.age === 'number' && Number.isInteger(body.age) && body.age >= 0 && body.age <= 110) {
    fixed.age = body.age;
  }
  if (body.gender === 'M' || body.gender === 'F') fixed.gender = body.gender;

  try {
    const generated = await callAI(buildPatientFillPrompt(condition, fixed), { maxTokens: 700 });
    const fill = sanitizePatientFill(generated, fixed);
    if (!fill) {
      return NextResponse.json(
        { error: 'The AI could not make a patient from that condition. Try naming it differently.' },
        { status: 502 },
      );
    }
    return NextResponse.json({ fill });
  } catch (err) {
    console.error('Patient AI fill failed', err);
    const { error, status } = aiErrorResponse(err, 'the patient chart');
    return NextResponse.json({ error }, { status });
  }
}
