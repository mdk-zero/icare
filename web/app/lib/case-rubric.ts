/**
 * Hospital case presentations (migration 056): the rubric faculty grade a
 * case on, what a student must fill in before handing it in, and the shape
 * the observations are held to.
 *
 * Criteria use the same three-level scale as scenario tasks, and are scored
 * through gradedScore so a rating is worth the same everywhere.
 */
import { gradedScore, type TaskRating } from './task-ratings';

export interface CaseCriterion {
  key: string;
  label: string;
  description: string;
}

/** Equally weighted; the keys are stored in case_submission_ratings.criterion. */
export const CASE_CRITERIA: readonly CaseCriterion[] = [
  {
    key: 'profile',
    label: 'Patient profile & history',
    description: 'Presents the anonymised patient, chief complaint and relevant history clearly.',
  },
  {
    key: 'assessment',
    label: 'Assessment findings',
    description: 'Reports the observed vital signs, TPR, IV fluids and other findings accurately.',
  },
  {
    key: 'diagnoses',
    label: 'Nursing diagnoses',
    description: 'Derives appropriate, prioritised nursing diagnoses from the assessment.',
  },
  {
    key: 'interventions',
    label: 'Interventions & rationale',
    description: 'Explains the nursing care given and why, tied to each diagnosis.',
  },
  {
    key: 'delivery',
    label: 'Presentation delivery',
    description: 'Organised, confident delivery that answers questions and protects patient privacy.',
  },
];

const CRITERION_KEYS = new Set(CASE_CRITERIA.map((c) => c.key));
const CRITERION_POINTS = 10;

export function isCaseCriterion(key: unknown): key is string {
  return typeof key === 'string' && CRITERION_KEYS.has(key);
}

/** 0–100; a criterion nobody rated earns nothing. */
export function caseScore(ratings: ReadonlyMap<string, TaskRating>): number {
  const tasks = CASE_CRITERIA.map((c) => ({ id: c.key, points: CRITERION_POINTS }));
  const completions = new Map(
    [...ratings].filter(([key]) => CRITERION_KEYS.has(key)).map(([key, rating]) => [key, { rating }]),
  );
  return gradedScore(tasks, completions);
}

export function allCriteriaRated(ratings: ReadonlyMap<string, TaskRating>): boolean {
  return CASE_CRITERIA.every((c) => ratings.has(c.key));
}

/** The fields a case must have before it can be handed in, with their labels. */
export const REQUIRED_CASE_FIELDS = [
  ['patient_initials', 'Patient initials'],
  ['age', 'Age'],
  ['sex', 'Sex'],
  ['admitting_diagnosis', 'Admitting diagnosis'],
  ['chief_complaint', 'Chief complaint'],
  ['nursing_diagnoses', 'Nursing diagnoses'],
  ['interventions', 'Interventions'],
] as const;

export type CaseTextField =
  | 'hospital'
  | 'ward'
  | 'admitting_diagnosis'
  | 'chief_complaint'
  | 'history'
  | 'medications'
  | 'nursing_diagnoses'
  | 'interventions';

export const CASE_TEXT_FIELDS: readonly CaseTextField[] = [
  'hospital',
  'ward',
  'admitting_diagnosis',
  'chief_complaint',
  'history',
  'medications',
  'nursing_diagnoses',
  'interventions',
];

/** Labels of the required fields still empty; [] when the case can be submitted. */
export function missingCaseFields(row: Record<string, unknown>): string[] {
  return REQUIRED_CASE_FIELDS.filter(([key]) => {
    const value = row[key];
    if (value === null || value === undefined) return true;
    return typeof value === 'string' && value.trim().length === 0;
  }).map(([, label]) => label);
}

export function isLateSubmission(submittedAt: string | null, deadline: string | null): boolean {
  if (!submittedAt || !deadline) return false;
  return new Date(submittedAt).getTime() > new Date(deadline).getTime();
}

// ─── Observations ────────────────────────────────────────────────────────────

export interface VitalsObservation {
  heart_rate: number | null;
  bp_systolic: number | null;
  bp_diastolic: number | null;
  temperature_c: number | null;
  respiratory_rate: number | null;
  oxygen_saturation: number | null;
  pain_score: number | null;
  notes: string;
  observed_at: string | null;
}

export interface TprObservation {
  temperature_c: number | null;
  pulse: number | null;
  respiration: number | null;
  remarks: string;
  observed_at: string | null;
}

export interface IvfObservation {
  solution: string;
  volume_ml: number | null;
  rate_ml_hr: number | null;
  site: string;
  remarks: string;
  observed_at: string | null;
}

export interface CaseObservations {
  vitals: VitalsObservation[];
  tpr: TprObservation[];
  ivf: IvfObservation[];
}

export const MAX_OBSERVATIONS = 50;
const MAX_OBSERVATION_TEXT = 500;

function num(value: unknown): number | null {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, MAX_OBSERVATION_TEXT) : '';
}

function when(value: unknown): string | null {
  if (typeof value !== 'string' || value.length === 0) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function list(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v))
    .slice(0, MAX_OBSERVATIONS);
}

/**
 * Keeps only the known fields of each entry. Anything else is dropped, so a
 * free-form key — a patient's name, say — can't ride along into storage.
 */
export function sanitizeObservations(input: unknown): CaseObservations {
  const src = typeof input === 'object' && input !== null ? (input as Record<string, unknown>) : {};
  return {
    vitals: list(src.vitals).map((v) => ({
      heart_rate: num(v.heart_rate),
      bp_systolic: num(v.bp_systolic),
      bp_diastolic: num(v.bp_diastolic),
      temperature_c: num(v.temperature_c),
      respiratory_rate: num(v.respiratory_rate),
      oxygen_saturation: num(v.oxygen_saturation),
      pain_score: num(v.pain_score),
      notes: text(v.notes),
      observed_at: when(v.observed_at),
    })),
    tpr: list(src.tpr).map((v) => ({
      temperature_c: num(v.temperature_c),
      pulse: num(v.pulse),
      respiration: num(v.respiration),
      remarks: text(v.remarks),
      observed_at: when(v.observed_at),
    })),
    ivf: list(src.ivf)
      .map((v) => ({
        solution: text(v.solution),
        volume_ml: num(v.volume_ml),
        rate_ml_hr: num(v.rate_ml_hr),
        site: text(v.site),
        remarks: text(v.remarks),
        observed_at: when(v.observed_at),
      }))
      // The solution is the one thing an IVF entry can't do without.
      .filter((v) => v.solution.length > 0),
  };
}
