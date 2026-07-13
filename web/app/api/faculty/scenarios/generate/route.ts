import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';

function isFacultyOrAdmin(role: string | undefined): boolean {
  return role === 'faculty' || role === 'admin';
}

interface PatientContext {
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

function invalidSessionResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function forbiddenResponse() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

function buildPrompt(userPrompt: string, patient?: PatientContext | null): string {
  const patientBlock = patient
    ? `
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
`
    : '';

  return `You are a clinical nursing education expert. Create a realistic simulation scenario for nursing students based on the faculty request below.

Faculty request: "${userPrompt.replace(/"/g, '\\"')}"
${patientBlock}

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

async function fetchPatient(supabase: ReturnType<typeof getSupabaseAdmin>, patientId: string): Promise<PatientContext | null> {
  const { data, error } = await supabase
    .from('patients')
    .select('name, age, gender, room_number, diagnosis, admission_date, vital_signs, labs, mimic_id, medical_history')
    .eq('id', patientId)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as PatientContext;
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
      patient = await fetchPatient(supabase, body.patient_id.trim());
    }

    const generated = await callAI(buildPrompt(prompt, patient));
    const scenario = sanitizeScenario(generated);

    return NextResponse.json({ scenario });
  } catch (err) {
    console.error('Generate AI scenario failed', err);
    const { error, status } = aiErrorResponse(err, 'scenario');
    return NextResponse.json({ error }, { status });
  }
}
