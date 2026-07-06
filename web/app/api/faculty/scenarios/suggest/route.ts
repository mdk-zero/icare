import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callOpenRouter } from '@/app/lib/ai/openrouter';

const validDifficulties = ['beginner', 'intermediate', 'advanced'] as const;
const validCategories = [
  'Cardiac Emergency',
  'Respiratory Emergency',
  'Neurological Emergency',
  'Trauma',
  'Medical-Surgical',
  'Patient Education',
  'Infection Management',
  'Critical Care',
  'Medication Safety',
  'General',
] as const;

const scenarioFocuses = [
  'interpreting and acting on abnormal lab values',
  'a morning-shift handoff that includes one abnormal finding the student must investigate',
  'recognizing early signs of clinical deterioration',
  'patient education and discharge planning',
  'prioritizing nursing interventions',
  'SBAR communication to the provider',
  'medication safety and double-checking orders',
];

interface PatientContext {
  id: string;
  name: string;
  age: number;
  gender: string;
  room_number: string;
  diagnosis: string;
  admission_date: string;
  vital_signs: Record<string, unknown>;
  labs: Record<string, unknown>;
  mimic_id: string;
  medical_history: string | null;
}

function isValidDifficulty(value: unknown): value is typeof validDifficulties[number] {
  return typeof value === 'string' && (validDifficulties as readonly string[]).includes(value);
}

function isValidCategory(value: unknown): value is typeof validCategories[number] {
  return typeof value === 'string' && (validCategories as readonly string[]).includes(value);
}

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

async function fetchPatient(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  patientId: string,
): Promise<PatientContext | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('id, name, age, gender, room_number, diagnosis, admission_date, vital_signs, labs, mimic_id, medical_history')
    .eq('id', patientId)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as PatientContext;
}

async function pickSuggestedPatient(supabase: ReturnType<typeof getSupabaseAdmin>): Promise<PatientContext | null> {
  const { data: patients, error } = await supabase
    .from('patients')
    .select('id, name, age, gender, room_number, diagnosis, admission_date, vital_signs, labs, mimic_id, medical_history')
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
  difficulty: typeof validDifficulties[number] | null,
  category: typeof validCategories[number] | null,
): string {
  const focus = scenarioFocuses[Math.floor(Math.random() * scenarioFocuses.length)];
  const difficultyText = difficulty ? `${difficulty}-level` : 'appropriate-difficulty';
  const categoryText = category ? `${category}` : 'nursing education';

  return `Create a ${difficultyText} ${categoryText} simulation scenario for ${patient.name}, a ${patient.age}-year-old ${patient.gender} admitted with ${patient.diagnosis}. The scenario should focus on ${focus}.`;
}

function buildPrompt(userPrompt: string, patient: PatientContext): string {
  return `You are a clinical nursing education expert. Create a realistic simulation scenario for nursing students based on the faculty request below.

Faculty request: "${userPrompt.replace(/"/g, '\\"')}"

Use the following MIMIC-IV patient record as the basis for the scenario:

- Name: ${patient.name}
- Age: ${patient.age}
- Gender: ${patient.gender}
- Room: ${patient.room_number}
- Diagnosis: ${patient.diagnosis}
- Admission Date: ${patient.admission_date}
- Vital Signs: ${JSON.stringify(patient.vital_signs, null, 2)}
- Labs: ${JSON.stringify(patient.labs, null, 2)}
- MIMIC ID: ${patient.mimic_id}${patient.medical_history ? `\n- Medical History: ${patient.medical_history}` : ''}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanations):

{
  "title": "string",
  "description": "string",
  "difficulty": "beginner" | "intermediate" | "advanced",
  "category": "string",
  "patient_case": {
    "chief_complaint": "string",
    "vitals": {
      "heart_rate": number,
      "blood_pressure": "string",
      "temperature": number,
      "respiratory_rate": number,
      "oxygen_saturation": number
    },
    "medical_history": "string",
    "physical_exam": "string",
    "diagnosis": "string",
    "treatment_plan": "string"
  },
  "learning_objectives": ["string", "string", "string"]
}

Guidelines:
- If a patient record is provided, base vitals/diagnosis on it but craft a coherent teaching case.
- Difficulty should match clinical complexity.
- Learning objectives must be measurable and nursing-focused.
- Keep the scenario clinically plausible and safe for educational use.
- Treat this as the patient's first recorded encounter: medical_history must describe only pre-existing background (chronic conditions, current medications, allergies, prior surgeries before this admission) — do not reference any previous hospital visits, prior scenarios, or prior nursing encounters in the system.`;
}

interface PatientCase {
  chief_complaint: string;
  vitals: {
    heart_rate: number | null;
    blood_pressure: string;
    temperature: number | null;
    respiratory_rate: number | null;
    oxygen_saturation: number | null;
  };
  medical_history: string;
  physical_exam: string;
  diagnosis: string;
  treatment_plan: string;
}

function pickString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function pickNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function sanitizePatientCase(input: unknown): PatientCase {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const rawVitals = raw.vitals && typeof raw.vitals === 'object'
    ? (raw.vitals as Record<string, unknown>)
    : {};

  return {
    chief_complaint: pickString(raw.chief_complaint),
    vitals: {
      heart_rate: pickNumber(rawVitals.heart_rate),
      blood_pressure: pickString(rawVitals.blood_pressure),
      temperature: pickNumber(rawVitals.temperature),
      respiratory_rate: pickNumber(rawVitals.respiratory_rate),
      oxygen_saturation: pickNumber(rawVitals.oxygen_saturation),
    },
    medical_history: pickString(raw.medical_history),
    physical_exam: pickString(raw.physical_exam),
    diagnosis: pickString(raw.diagnosis),
    treatment_plan: pickString(raw.treatment_plan),
  };
}

function sanitizeScenario(input: Record<string, unknown>): {
  title: string;
  description: string;
  difficulty: string;
  category: string;
  patient_case: PatientCase;
  learning_objectives: string[];
} {
  const validDifficulties = ['beginner', 'intermediate', 'advanced'];
  const difficulty =
    typeof input.difficulty === 'string' && validDifficulties.includes(input.difficulty)
      ? input.difficulty
      : 'intermediate';

  const learningObjectives = Array.isArray(input.learning_objectives)
    ? input.learning_objectives.filter((o): o is string => typeof o === 'string')
    : [];

  return {
    title: typeof input.title === 'string' ? input.title : 'AI Generated Scenario',
    description: typeof input.description === 'string' ? input.description : '',
    difficulty,
    category: typeof input.category === 'string' ? input.category : 'AI Generated',
    patient_case: sanitizePatientCase(input.patient_case),
    learning_objectives: learningObjectives.length > 0
      ? learningObjectives
      : ['Demonstrate clinical assessment skills', 'Apply evidence-based interventions'],
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callGemini(prompt: string, attempt = 1): Promise<Record<string, unknown>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.7,
        maxOutputTokens: 4096,
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    // Daily quota errors won't resolve by retrying, so fall back immediately.
    const isDailyQuota =
      text.includes('QuotaFailure') || text.includes('GenerateRequestsPerDay');
    // Retry on transient overload (503) or short-term rate limit (429) up to 3 times with backoff.
    if ((res.status === 503 || (res.status === 429 && !isDailyQuota)) && attempt < 3) {
      const delay = attempt * 1000;
      console.warn(`Gemini returned ${res.status}, retrying in ${delay}ms (attempt ${attempt})`);
      await sleep(delay);
      return callGemini(prompt, attempt + 1);
    }
    throw new Error(`Gemini API error (${res.status}): ${text}`);
  }

  const json = (await res.json()) as {
    candidates?: {
      content?: {
        parts?: { text?: string }[];
      };
      finishReason?: string;
    }[];
    error?: { message?: string };
  };

  if (json.error?.message) {
    throw new Error(`Gemini API error: ${json.error.message}`);
  }

  const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Gemini returned an empty response');
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    if (attempt < 2) {
      return callGemini(prompt, attempt + 1);
    }
    throw new Error('Failed to parse Gemini response as JSON after retry');
  }
}

async function callAI(prompt: string): Promise<Record<string, unknown>> {
  try {
    return await callGemini(prompt);
  } catch (geminiErr) {
    console.warn('Gemini failed, falling back to OpenRouter', geminiErr instanceof Error ? geminiErr.message : geminiErr);
    try {
      return await callOpenRouter(prompt);
    } catch (openrouterErr) {
      const messages = [
        geminiErr instanceof Error ? geminiErr.message : 'Gemini failed',
        openrouterErr instanceof Error ? openrouterErr.message : 'OpenRouter failed',
      ];
      throw new Error(messages.join('; '));
    }
  }
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
      patient = await fetchPatient(supabase, body.patient_id.trim());
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
    const generated = await callAI(buildPrompt(prompt, patient));
    const scenario = sanitizeScenario(generated);

    return NextResponse.json({
      scenario,
      patient_id: patient.id,
      prompt,
    });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : 'Unable to suggest scenario';
    const lower = rawMessage.toLowerCase();
    const isRateLimit =
      rawMessage.includes('429') ||
      lower.includes('rate limit') ||
      lower.includes('quota exceeded') ||
      lower.includes('resource_exhausted');

    if (isRateLimit) {
      console.warn('Suggest scenario rate-limited by AI provider');
      return NextResponse.json(
        { error: 'AI providers are currently rate-limited. Please try again in a moment.' },
        { status: 429 },
      );
    }

    console.error('Suggest scenario failed', err);
    return NextResponse.json(
      { error: 'Unable to suggest scenario. The AI service may be unavailable.' },
      { status: 500 },
    );
  }
}
