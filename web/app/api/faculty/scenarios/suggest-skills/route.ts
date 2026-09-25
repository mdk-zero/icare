import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { MAX_LESSON_CHARS } from '@/app/lib/ai/lesson';
import { fetchPatientContext } from '@/app/lib/ai/scenario';
import { listSkills } from '@/app/lib/taylor-skills';
import { aiSuggestions, keywordSuggestions } from '@/app/lib/skill-suggest';

/** Enough for a full case write-up; anything longer is trimmed. */
const MAX_CASE_CHARS = 8_000;

/**
 * POST { title, description?, learning_objectives?, patient_id?, lesson_text? }
 * → { suggestions: [{ id, reason }], source: 'ai' | 'keywords' }
 *
 * Detects the Taylor's skills a scenario calls for, for faculty to confirm.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const objectives = Array.isArray(body.learning_objectives)
    ? body.learning_objectives.filter((o): o is string => typeof o === 'string')
    : [];
  const parts = [
    text(body.title) && `Title: ${text(body.title)}`,
    text(body.description) && `Description: ${text(body.description)}`,
    objectives.length > 0 && `Learning objectives:\n- ${objectives.join('\n- ')}`,
  ];

  const supabase = getSupabaseAdmin();
  if (text(body.patient_id)) {
    const patient = await fetchPatientContext(supabase, text(body.patient_id));
    if (patient) parts.push(`Patient: ${patient.age}-year-old ${patient.gender}, ${patient.diagnosis}`);
  }
  const caseText = parts.filter(Boolean).join('\n').slice(0, MAX_CASE_CHARS);
  if (!caseText) {
    return NextResponse.json({ error: 'Describe the scenario first' }, { status: 400 });
  }
  const lesson = text(body.lesson_text).slice(0, MAX_LESSON_CHARS) || null;

  const catalog = await listSkills(supabase);
  try {
    const suggestions = await aiSuggestions(caseText, catalog, lesson);
    if (suggestions.length > 0) return NextResponse.json({ suggestions, source: 'ai' });
  } catch (err) {
    console.warn('AI skill detection failed, matching keywords instead', err instanceof Error ? err.message : err);
  }
  return NextResponse.json({ suggestions: keywordSuggestions(`${caseText}\n${lesson ?? ''}`, catalog), source: 'keywords' });
}
