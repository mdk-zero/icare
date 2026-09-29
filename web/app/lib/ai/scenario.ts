import { catalogPromptLines, isSkillId } from '@/app/lib/taylor-skills';
import type { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { ACTIVE_CHAPTERS, TAYLORS_CHAPTERS, type TaylorsChapter } from '@/scripts/taylors-chapters';

/** The Taylor's chapters the app teaches, which every patient case centres on. */
export const TAUGHT_CHAPTERS = TAYLORS_CHAPTERS.filter((c) => ACTIVE_CHAPTERS.includes(c.chapter));

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

export type ScenarioCategory = (typeof VALID_CATEGORIES)[number];

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
  category: string;
  patient_case: PatientCase;
  learning_objectives: string[];
  /** Taylor's skill ids the case calls for, from the catalog; faculty confirm them. */
  skills: string[];
}

/**
 * Coerces a raw AI object into something the scenarios table will accept.
 * category must land on an existing category (matched ignoring case,
 * returned in its stored spelling), or the insert is rejected.
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
    category: categories.find((c) => c.toLowerCase() === rawCategory) ?? 'General',
    patient_case: sanitizePatientCase(input.patient_case),
    learning_objectives:
      learningObjectives.length > 0
        ? learningObjectives
        : ['Demonstrate clinical assessment skills', 'Apply evidence-based interventions'],
    skills: Array.isArray(input.skills)
      ? [...new Set(input.skills.map((x) => (typeof x === 'string' ? x.replace(/^skill\s*/i, '').trim() : '')).filter(isSkillId))].slice(0, 6)
      : [],
  };
}

/** The roster patient's record block shared by every scenario prompt. */
export function patientRecordBlock(patient: PatientContext, label = 'patient record'): string {
  return `The following ${label}:

- Name: ${patient.name}
- Age: ${patient.age}
- Gender: ${patient.gender}
- Room: ${patient.room_number}
- Diagnosis: ${patient.diagnosis}
- Admission Date: ${patient.admission_date}
- Vital Signs: ${JSON.stringify(patient.vital_signs, null, 2)}
- Labs: ${JSON.stringify(patient.labs, null, 2)}${patient.medical_history ? `\n- Medical History: ${patient.medical_history}` : ''}`;
}

/** JSON shape every scenario prompt asks the model to return. */
export const SCENARIO_JSON_SHAPE = `{
  "title": "string",
  "description": "string",
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
  "learning_objectives": ["string", "string", "string"],
  "skills": ["1-7", "14-1"]
}`;

export const SCENARIO_GUIDELINES = `- If a patient record is provided, base vitals/diagnosis on it but craft a coherent teaching case.
- Learning objectives must be measurable and nursing-focused.
- Keep the scenario clinically plausible and safe for educational use.
- "skills" lists the 2 to 6 Taylor's clinical nursing skills the student performs in this case, most important first, by id from this catalog only (for a case on a topic Taylor's doesn't cover, list only the skills that genuinely apply, or none):
${catalogPromptLines()}
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

/** Patient cases aren't filed under categories any more; the column still needs one. */
export const UNCATEGORIZED = 'General';

/** Lesson topic names from a request body: trimmed, short, deduplicated. */
export function lessonTopics(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const names = value
    .filter((t): t is string => typeof t === 'string')
    .map((t) => t.trim().slice(0, 60))
    .filter(Boolean);
  return [...new Set(names)].slice(0, 20);
}

/**
 * A lesson topic outside Taylor's checklists. Taylor's stays the standard:
 * wherever one of its skills applies, the case follows it.
 */
export function newTopicInstruction(topics: readonly string[]): string {
  const names = topics.map((t) => `"${t.replace(/"/g, "'")}"`).join(', ');
  return `Centre the case on the lesson topic${topics.length === 1 ? '' : 's'} ${names}, which ${topics.length === 1 ? 'is' : 'are'} not in Taylor's checklists. Taylor's remains the standard: wherever one of its catalog skills applies, perform it as the catalog describes and list it in "skills".`;
}

/**
 * Tells the model which Taylor's chapters the case centres on — the
 * ones the faculty picked, or any of the taught ones — and where its skills
 * come from; or, for lesson topics outside them, those topics.
 */
function chapterInstruction(chapters: readonly TaylorsChapter[], topics: readonly string[] = []): string {
  if (chapters.length === 0 && topics.length > 0) return newTopicInstruction(topics);
  if (topics.length > 0) {
    const names = chapters.map((c) => `Chapter ${c.chapter}, ${c.name}`).join('; ');
    return `Centre the case on Taylor's ${names}, or on the lesson topic${topics.length === 1 ? '' : 's'} ${topics.map((t) => `"${t.replace(/"/g, "'")}"`).join(', ')}, which Taylor's checklists don't cover. Taylor's remains the standard: wherever one of its catalog skills applies, perform it as the catalog describes and list it in "skills".`;
  }
  if (chapters.length === 0) {
    return `Centre the case on one of these Taylor's chapters: ${TAUGHT_CHAPTERS.map((c) => `Chapter ${c.chapter}, ${c.name}`).join('; ')}.`;
  }
  const names = chapters.map((c) => `Chapter ${c.chapter}, ${c.name}`).join('; ');
  const prefixes = chapters.map((c) => `"${c.chapter}-"`).join(' or ');
  return `Centre the case on Taylor's ${names}, and take its "skills" mainly from ids starting ${prefixes}.`;
}

export interface ScenarioPromptOptions {
  lessonText?: string | null;
  /** The taught chapters the case must centre on; empty lets the model pick one. */
  chapters?: readonly TaylorsChapter[];
  /** Lesson topics outside Taylor's checklists the case may centre on instead. */
  topics?: readonly string[];
}

/** Prompt for a single scenario, optionally grounded in a patient record and/or a lesson. */
export function buildScenarioPrompt(
  userPrompt: string,
  patient?: PatientContext | null,
  { lessonText = null, chapters = [], topics = [] }: ScenarioPromptOptions = {},
): string {
  const patientBlock = patient ? `\nUse ${patientRecordBlock(patient, 'patient record as the basis for the scenario')}\n` : '';
  const request = userPrompt
    ? `Instructor request: "${userPrompt.replace(/"/g, '\\"')}"`
    : 'Instructor request: build a case that puts the lesson below into practice.';
  const lessonFocus = [
    userPrompt && 'Centre the case on the part of the lesson the instructor request points to.',
    patient && "Keep the patient record's diagnosis and vitals, and apply the lesson to this patient's care.",
  ]
    .filter(Boolean)
    .join(' ');

  return `You are a clinical nursing education expert. Create a realistic simulation scenario for nursing students based on the faculty request below.

${request}
${patientBlock}${lessonText ? `${lessonBlock(lessonText)}${lessonFocus ? `${lessonFocus}\n` : ''}` : ''}
${chapterInstruction(chapters, topics)} Set "category" to "${UNCATEGORIZED}".

Return ONLY a valid JSON object with this exact structure (no markdown, no explanations):

${SCENARIO_JSON_SHAPE}

Guidelines:
${SCENARIO_GUIDELINES}`;
}
