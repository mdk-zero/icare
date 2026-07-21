import type { getSupabaseAdmin } from '@/app/lib/supabase/server';

export const VALID_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;

export const VALID_CATEGORIES = [
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

export type ScenarioDifficulty = (typeof VALID_DIFFICULTIES)[number];
export type ScenarioCategory = (typeof VALID_CATEGORIES)[number];

export function isValidDifficulty(value: unknown): value is ScenarioDifficulty {
  return typeof value === 'string' && (VALID_DIFFICULTIES as readonly string[]).includes(value);
}

export function isValidCategory(value: unknown): value is ScenarioCategory {
  return typeof value === 'string' && (VALID_CATEGORIES as readonly string[]).includes(value);
}

export interface PatientContext {
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

export const PATIENT_CONTEXT_COLUMNS =
  'id, name, age, gender, room_number, diagnosis, admission_date, vital_signs, labs, mimic_id, medical_history';

export async function fetchPatientContext(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  patientId: string,
): Promise<PatientContext | null> {
  const { data, error } = await supabase
    .from('patients')
    .select(PATIENT_CONTEXT_COLUMNS)
    .eq('id', patientId)
    .maybeSingle();

  if (error || !data) return null;
  return data as unknown as PatientContext;
}

export interface PatientCase {
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

export function sanitizePatientCase(input: unknown): PatientCase {
  const raw = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const rawVitals =
    raw.vitals && typeof raw.vitals === 'object' ? (raw.vitals as Record<string, unknown>) : {};

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

export interface SanitizedScenario {
  title: string;
  description: string;
  difficulty: ScenarioDifficulty;
  category: ScenarioCategory;
  patient_case: PatientCase;
  learning_objectives: string[];
}

/**
 * Coerces a raw AI object into something the scenarios table will accept.
 * difficulty/category must land on the DB enums or the insert is rejected.
 */
export function sanitizeScenario(input: Record<string, unknown>): SanitizedScenario {
  const learningObjectives = Array.isArray(input.learning_objectives)
    ? input.learning_objectives.filter((o): o is string => typeof o === 'string')
    : [];

  return {
    title: typeof input.title === 'string' ? input.title : 'AI Generated Scenario',
    description: typeof input.description === 'string' ? input.description : '',
    difficulty: isValidDifficulty(input.difficulty) ? input.difficulty : 'intermediate',
    category: isValidCategory(input.category) ? input.category : 'General',
    patient_case: sanitizePatientCase(input.patient_case),
    learning_objectives:
      learningObjectives.length > 0
        ? learningObjectives
        : ['Demonstrate clinical assessment skills', 'Apply evidence-based interventions'],
  };
}

/** The MIMIC-IV record block shared by every scenario prompt. */
export function patientRecordBlock(patient: PatientContext, label = 'patient record'): string {
  return `The following MIMIC-IV ${label}:

- Name: ${patient.name}
- Age: ${patient.age}
- Gender: ${patient.gender}
- Room: ${patient.room_number}
- Diagnosis: ${patient.diagnosis}
- Admission Date: ${patient.admission_date}
- Vital Signs: ${JSON.stringify(patient.vital_signs, null, 2)}
- Labs: ${JSON.stringify(patient.labs, null, 2)}
- MIMIC ID: ${patient.mimic_id}${patient.medical_history ? `\n- Medical History: ${patient.medical_history}` : ''}`;
}

/** JSON shape every scenario prompt asks the model to return. */
export const SCENARIO_JSON_SHAPE = `{
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
}`;

export const SCENARIO_GUIDELINES = `- If a patient record is provided, base vitals/diagnosis on it but craft a coherent teaching case.
- Difficulty should match clinical complexity.
- Learning objectives must be measurable and nursing-focused.
- Keep the scenario clinically plausible and safe for educational use.
- Treat this as the patient's first recorded encounter: medical_history must describe only pre-existing background (chronic conditions, current medications, allergies, prior surgeries before this admission) — do not reference any previous hospital visits, prior scenarios, or prior nursing encounters in the system.`;

/** Prompt for a single scenario, optionally grounded in a patient record. */
export function buildScenarioPrompt(userPrompt: string, patient?: PatientContext | null): string {
  const patientBlock = patient ? `\nUse ${patientRecordBlock(patient, 'patient record as the basis for the scenario')}\n` : '';

  return `You are a clinical nursing education expert. Create a realistic simulation scenario for nursing students based on the faculty request below.

Faculty request: "${userPrompt.replace(/"/g, '\\"')}"
${patientBlock}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanations):

${SCENARIO_JSON_SHAPE}

Guidelines:
${SCENARIO_GUIDELINES}`;
}
