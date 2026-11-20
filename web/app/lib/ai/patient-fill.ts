/**
 * The 'Fill with AI' step of the Add Patient form: the instructor names a
 * condition, and the model drafts the rest of the admission chart (age, sex,
 * diagnosis, vital signs and labs) for a simulated patient. Pure functions,
 * so the route and the demo share them and they can be tried without a call.
 */

export interface PatientFill {
  age: number | null;
  gender: 'M' | 'F' | null;
  diagnosis: string;
  vital_signs: {
    heart_rate: number | null;
    blood_pressure: string | null;
    temperature: number | null;
    respiratory_rate: number | null;
    oxygen_saturation: number | null;
  };
  labs: Record<string, number>;
}

/** What the form already holds; the model keeps these rather than choosing. */
export interface PatientFillFixed {
  age?: number;
  gender?: 'M' | 'F';
}

export const MAX_CONDITION_CHARS = 120;
const MAX_DIAGNOSIS_CHARS = 160;
const MAX_LABS = 8;

/**
 * The lab names and units the condition presets use, plus the ones other
 * common admissions need. A chart shows a lab as its name and a bare number,
 * so every patient has to use the same name and unit for the same test: a
 * glucose of 7.8 (mmol/L) beside a preset's 148 (mg/dL) would read as
 * nonsense. The range is what a real admission can show; a value outside it
 * is taken as a unit mix-up and dropped.
 */
export const LAB_VOCABULARY: { name: string; unit: string; min: number; max: number }[] = [
  { name: 'White Blood Cells', unit: '×10⁹/L', min: 0.5, max: 60 },
  { name: 'Red Blood Cells', unit: '×10¹²/L', min: 1.5, max: 7.5 },
  { name: 'Hemoglobin', unit: 'g/dL', min: 4, max: 22 },
  { name: 'Hematocrit', unit: '%', min: 12, max: 65 },
  { name: 'Platelet Count', unit: '×10⁹/L', min: 5, max: 1000 },
  { name: 'C-Reactive Protein', unit: 'mg/L', min: 0, max: 400 },
  { name: 'ESR', unit: 'mm/h', min: 0, max: 150 },
  { name: 'Procalcitonin', unit: 'ng/mL', min: 0, max: 100 },
  { name: 'Lactate', unit: 'mmol/L', min: 0.3, max: 20 },
  { name: 'Sodium', unit: 'mmol/L', min: 110, max: 170 },
  { name: 'Potassium', unit: 'mmol/L', min: 1.8, max: 8 },
  { name: 'Chloride', unit: 'mmol/L', min: 80, max: 130 },
  { name: 'Bicarbonate', unit: 'mmol/L', min: 4, max: 45 },
  { name: 'Calcium', unit: 'mg/dL', min: 5, max: 15 },
  { name: 'Magnesium', unit: 'mg/dL', min: 0.8, max: 4 },
  { name: 'Creatinine', unit: 'mg/dL', min: 0.2, max: 15 },
  { name: 'Blood Urea Nitrogen', unit: 'mg/dL', min: 2, max: 200 },
  { name: 'Blood Glucose', unit: 'mg/dL', min: 20, max: 1200 },
  { name: 'HbA1c', unit: '%', min: 4, max: 18 },
  { name: 'Serum Ketones', unit: 'mmol/L', min: 0, max: 10 },
  { name: 'Total Cholesterol', unit: 'mg/dL', min: 80, max: 450 },
  { name: 'ALT', unit: 'U/L', min: 3, max: 5000 },
  { name: 'AST', unit: 'U/L', min: 3, max: 5000 },
  { name: 'Total Bilirubin', unit: 'mg/dL', min: 0.1, max: 30 },
  { name: 'Albumin', unit: 'g/dL', min: 1, max: 6 },
  { name: 'Lipase', unit: 'U/L', min: 5, max: 5000 },
  { name: 'Amylase', unit: 'U/L', min: 10, max: 3000 },
  { name: 'Troponin', unit: 'ng/mL', min: 0, max: 50 },
  { name: 'BNP', unit: 'pg/mL', min: 0, max: 5000 },
  { name: 'INR', unit: 'ratio', min: 0.8, max: 10 },
  { name: 'Arterial pH', unit: 'pH', min: 6.8, max: 7.8 },
  { name: 'PaCO2', unit: 'mmHg', min: 15, max: 120 },
  { name: 'PaO2', unit: 'mmHg', min: 30, max: 500 },
  { name: 'TSH', unit: 'mIU/L', min: 0.01, max: 100 },
  { name: 'Uric Acid', unit: 'mg/dL', min: 1, max: 20 },
  { name: 'Urine Protein', unit: 'mg/24 h', min: 0, max: 10000 },
];

const LAB_BY_NAME = new Map(LAB_VOCABULARY.map((lab) => [lab.name.toLowerCase(), lab]));

/** Single-line, length-capped text for the prompt and the chart. */
function oneLine(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

/** The condition as typed, made safe to quote in the prompt. */
export function cleanCondition(value: unknown): string {
  return oneLine(value, MAX_CONDITION_CHARS).replace(/"/g, "'");
}

export function buildPatientFillPrompt(condition: string, fixed: PatientFillFixed = {}): string {
  const facts = [
    fixed.age !== undefined ? `- The patient is ${fixed.age} years old. Keep this age.` : '',
    fixed.gender ? `- The patient is ${fixed.gender === 'M' ? 'male' : 'female'}. Keep this sex.` : '',
  ].filter(Boolean);
  const labs = LAB_VOCABULARY.map((lab) => `${lab.name} (${lab.unit})`).join(', ');

  return `You are a clinical nurse educator setting up a SIMULATED patient for nursing students at a school in the Philippines. The patient is fictional, a training case, not a real person.

The instructor chose this condition: "${condition}"
${facts.length ? `\n${facts.join('\n')}\n` : ''}
Fill in this patient's admission chart.
- age and sex: ${facts.length ? 'use the facts above; choose only what they leave open' : 'choose an age and sex that commonly present with this condition'}. An adult unless the condition is about children; female for pregnancy, delivery or other female-only conditions. sex is "M" or "F".
- diagnosis: the admitting diagnosis as written on a chart, one line, at most 120 characters, specific to this presentation (for example "Dengue fever with warning signs, day 4 of illness"). No patient name.
- vital_signs on admission, consistent with the condition and the age: heart_rate in beats/min, blood_pressure as "systolic/diastolic" in mmHg, temperature in °C with one decimal, respiratory_rate in breaths/min, oxygen_saturation in %.
- labs: 3 to 6 admission results that matter for this condition, abnormal where the condition makes them abnormal. Use ONLY these names, with values as plain numbers in these units: ${labs}.
- If the condition is not a medical condition or makes no sense, answer with an empty diagnosis.

Respond with JSON only, in exactly this shape:
{"age": 45, "sex": "M", "diagnosis": "...", "vital_signs": {"heart_rate": 88, "blood_pressure": "130/85", "temperature": 37.2, "respiratory_rate": 18, "oxygen_saturation": 97}, "labs": {"White Blood Cells": 9.8, "Hemoglobin": 13.6}}`;
}

function toNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.trim()) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Vital signs come back clamped into a range a ward can show, never dropped. */
function vital(value: unknown, min: number, max: number, decimals = 0): number | null {
  const n = toNumber(value);
  if (n === null) return null;
  const factor = 10 ** decimals;
  return Math.round(Math.min(max, Math.max(min, n)) * factor) / factor;
}

function bloodPressure(value: unknown): string | null {
  const match = typeof value === 'string' ? value.trim().match(/^(\d{2,3})\s*\/\s*(\d{2,3})$/) : null;
  if (!match) return null;
  const systolic = Math.min(240, Math.max(60, Number(match[1])));
  const diastolic = Math.min(150, Math.max(30, Number(match[2])));
  return systolic > diastolic + 10 ? `${systolic}/${diastolic}` : null;
}

function labs(value: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
  for (const [rawName, rawValue] of Object.entries(value as Record<string, unknown>)) {
    const lab = LAB_BY_NAME.get(rawName.trim().toLowerCase());
    const n = toNumber(rawValue);
    if (!lab || n === null || n < lab.min || n > lab.max || lab.name in out) continue;
    // Three significant figures at most, as a lab slip would print it.
    out[lab.name] = Number(n.toPrecision(3));
    if (Object.keys(out).length === MAX_LABS) break;
  }
  return out;
}

/**
 * Pulls the model's reply into the chart's shape. Returns null when there is
 * no diagnosis, which is the model's way of saying the condition made no
 * sense; a chart without one would look filled while saying nothing. Age and
 * sex the instructor already chose win over whatever the model said.
 */
export function sanitizePatientFill(raw: Record<string, unknown>, fixed: PatientFillFixed = {}): PatientFill | null {
  const diagnosis = oneLine(raw.diagnosis, MAX_DIAGNOSIS_CHARS);
  if (!diagnosis) return null;

  const age = toNumber(raw.age);
  const sex = oneLine(raw.sex ?? raw.gender, 10).toUpperCase();
  const vs = raw.vital_signs && typeof raw.vital_signs === 'object' ? (raw.vital_signs as Record<string, unknown>) : {};

  return {
    age: fixed.age ?? (age === null ? null : Math.round(Math.min(110, Math.max(0, age)))),
    gender: fixed.gender ?? (sex === 'M' || sex === 'MALE' ? 'M' : sex === 'F' || sex === 'FEMALE' ? 'F' : null),
    diagnosis,
    vital_signs: {
      heart_rate: vital(vs.heart_rate, 30, 200),
      blood_pressure: bloodPressure(vs.blood_pressure),
      temperature: vital(vs.temperature, 34, 42, 1),
      respiratory_rate: vital(vs.respiratory_rate, 6, 50),
      oxygen_saturation: vital(vs.oxygen_saturation, 70, 100),
    },
    labs: labs(raw.labs),
  };
}
