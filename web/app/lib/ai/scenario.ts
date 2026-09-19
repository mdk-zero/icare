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
  category: string;
  patient_case: PatientCase;
  learning_objectives: string[];
}

/**
 * Coerces a raw AI object into something the scenarios table will accept.
 * difficulty must land on its enum and category on an existing category
 * (matched ignoring case, returned in its stored spelling), or the insert is
 * rejected.
 */
export function sanitizeScenario(
  input: Record<string, unknown>,
  categories: readonly string[] = VALID_CATEGORIES,
): SanitizedScenario {
  const rawCategory = typeof input.category === 'string' ? input.category.trim().toLowerCase() : '';
  const learningObjectives = Array.isArray(input.learning_objectives)
    ? input.learning_objectives.filter((o): o is string => typeof o === 'string')
    : [];

  return {
    title: typeof input.title === 'string' ? input.title : 'AI Generated Scenario',
    description: typeof input.description === 'string' ? input.description : '',
    difficulty: isValidDifficulty(input.difficulty) ? input.difficulty : 'intermediate',
    category: categories.find((c) => c.toLowerCase() === rawCategory) ?? 'General',
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

/**
 * The lesson a scenario must teach from, and the rules that hold for every
 * case built on one. Callers add what the case centres on — a faculty request,
 * a topic category, a patient.
 */
export function lessonBlock(lessonText: string): string {
  return `
Lesson material the scenario must teach from:
"""
${lessonText}
"""

Ground each scenario you write in this lesson. Choose a clinical situation in which a nurse has to apply what the lesson teaches. The learning_objectives and the nursing actions in treatment_plan must come from the lesson's own content — the assessments, procedures, interventions and teaching points it covers — and nothing in the scenario may contradict the lesson. Where the lesson is silent (patient background, baseline vitals, history), fill in clinically plausible details. Students read every field, so write the case as a real clinical situation and never mention the lesson, checklist, or provided material.
`;
}

/** Tells the model which category to file the case under, or which to pick from. */
function categoryInstruction(category: string | null, categories: readonly string[]): string {
  return category
    ? `Set "category" to exactly "${category}" and centre the case on that topic.`
    : `Set "category" to exactly one of: ${categories.map((c) => `"${c}"`).join(', ')}.`;
}

export interface ScenarioPromptOptions {
  lessonText?: string | null;
  /** The category the case must be filed under; otherwise the model picks from `categories`. */
  category?: string | null;
  /** Categories the model may pick from. Defaults to the ten presets. */
  categories?: readonly string[];
}

/** Prompt for a single scenario, optionally grounded in a patient record and/or a lesson. */
export function buildScenarioPrompt(
  userPrompt: string,
  patient?: PatientContext | null,
  { lessonText = null, category = null, categories = VALID_CATEGORIES }: ScenarioPromptOptions = {},
): string {
  const patientBlock = patient ? `\nUse ${patientRecordBlock(patient, 'patient record as the basis for the scenario')}\n` : '';
  const request = userPrompt
    ? `Faculty request: "${userPrompt.replace(/"/g, '\\"')}"`
    : 'Faculty request: build a case that puts the lesson below into practice.';
  const lessonFocus = [
    userPrompt && 'Centre the case on the part of the lesson the faculty request points to.',
    patient && "Keep the patient record's diagnosis and vitals, and apply the lesson to this patient's care.",
  ]
    .filter(Boolean)
    .join(' ');

  return `You are a clinical nursing education expert. Create a realistic simulation scenario for nursing students based on the faculty request below.

${request}
${patientBlock}${lessonText ? `${lessonBlock(lessonText)}${lessonFocus ? `${lessonFocus}\n` : ''}` : ''}
${categoryInstruction(category, categories)}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanations):

${SCENARIO_JSON_SHAPE}

Guidelines:
${SCENARIO_GUIDELINES}`;
}
