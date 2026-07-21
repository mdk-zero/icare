import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';
import {
  PATIENT_CONTEXT_COLUMNS,
  buildScenarioPrompt,
  fetchPatientContext,
  isValidCategory,
  isValidDifficulty,
  sanitizeScenario,
  type PatientContext,
  type ScenarioCategory,
  type ScenarioDifficulty,
} from '@/app/lib/ai/scenario';

const scenarioFocuses = [
  'interpreting and acting on abnormal lab values',
  'a morning-shift handoff that includes one abnormal finding the student must investigate',
  'recognizing early signs of clinical deterioration',
  'patient education and discharge planning',
  'prioritizing nursing interventions',
  'SBAR communication to the provider',
  'medication safety and double-checking orders',
];

function forbiddenResponse() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function getLabRanges(gender: string) {
  const isFemale = gender.toLowerCase() === 'f' || gender.toLowerCase() === 'female';
  return {
    'White Blood Cells': { min: 4.5, max: 11.0 },
    'Hemoglobin': { min: isFemale ? 12.0 : 13.5, max: isFemale ? 15.5 : 17.5 },
    'Red Blood Cells': { min: isFemale ? 4.0 : 4.5, max: isFemale ? 5.0 : 5.5 },
    'Platelet Count': { min: 150, max: 400 },
    'Creatinine': { min: 0.7, max: 1.3 },
    'Potassium': { min: 3.5, max: 5.0 },
    'Chloride': { min: 98, max: 106 },
    'Bicarbonate': { min: 22, max: 29 },
    'Urea Nitrogen': { min: 7, max: 20 },
  };
}

function scorePatientAbnormality(patient: PatientContext): number {
  const ranges = getLabRanges(patient.gender);
  let score = 0;

  for (const [key, value] of Object.entries(patient.labs ?? {})) {
    const range = ranges[key as keyof typeof ranges];
    if (!range || typeof value !== 'number') continue;

    if (value < range.min) {
      score += (range.min - value) / range.min;
    } else if (value > range.max) {
      score += (value - range.max) / range.max;
    }
  }

  return score;
}

async function pickSuggestedPatient(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<PatientContext | null> {
  const { data: patients, error } = await supabase
    .from('patients')
    .select(PATIENT_CONTEXT_COLUMNS)
    .limit(100);

  if (error || !patients || patients.length === 0) return null;

  const typedPatients = patients as unknown as PatientContext[];

  // Score all patients and pick the one with the most abnormal labs.
  const scored = typedPatients.map((p) => ({
    patient: p,
    score: scorePatientAbnormality(p),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Pick from the top 3 to add variety, unless only one exists.
  const topPool = scored.slice(0, Math.min(3, scored.length));
  const chosen = topPool[Math.floor(Math.random() * topPool.length)];
  return chosen.patient;
}

function generateSuggestionPrompt(
  patient: PatientContext,
  difficulty: ScenarioDifficulty | null,
  category: ScenarioCategory | null,
): string {
  const focus = scenarioFocuses[Math.floor(Math.random() * scenarioFocuses.length)];
  const difficultyText = difficulty ? `${difficulty}-level` : 'appropriate-difficulty';
  const categoryText = category ? `${category}` : 'nursing education';

  return `Create a ${difficultyText} ${categoryText} simulation scenario for ${patient.name}, a ${patient.age}-year-old ${patient.gender} admitted with ${patient.diagnosis}. The scenario should focus on ${focus}.`;
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorizedResponse();
  if (!['faculty', 'admin'].includes(session.role)) return forbiddenResponse();

  let body: { difficulty?: unknown; category?: unknown; patient_id?: unknown };
  try {
    body = (await request.json()) as { difficulty?: unknown; category?: unknown; patient_id?: unknown };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const difficulty = isValidDifficulty(body.difficulty) ? body.difficulty : null;
  const category = isValidCategory(body.category) ? body.category : null;

  try {
    const supabase = getSupabaseAdmin();

    let patient: PatientContext | null = null;

    if (typeof body.patient_id === 'string' && body.patient_id.trim()) {
      patient = await fetchPatientContext(supabase, body.patient_id.trim());
      if (!patient) {
        return NextResponse.json({ error: 'Selected patient not found' }, { status: 404 });
      }
    } else {
      patient = await pickSuggestedPatient(supabase);
      if (!patient) {
        return NextResponse.json({ error: 'No patients available to suggest' }, { status: 404 });
      }
    }

    const prompt = generateSuggestionPrompt(patient, difficulty, category);
    const generated = await callAI(buildScenarioPrompt(prompt, patient));
    const scenario = sanitizeScenario(generated);

    return NextResponse.json({
      scenario,
      patient_id: patient.id,
      prompt,
    });
  } catch (err) {
    console.error('Suggest scenario failed', err);
    const { error, status } = aiErrorResponse(err, 'scenario');
    return NextResponse.json({ error }, { status });
  }
}
