/**
 * The forms an instructor can add to a Return Demonstration (migration 094),
 * and the rules a filled-in form is held to. A form is a sheet of rows, such
 * as one row per IV bottle or per TPR reading; each row has the form's fields.
 *
 * The database stores only form keys and the rows entered, so a form is added
 * or changed here. mobile/lib/return-demo-forms.ts is a copy for the app:
 * keep the two the same.
 *
 * Pure, so the API routes, the instructor pages and the demo share it.
 */

export type FormFieldType = 'number' | 'text' | 'longtext' | 'time';

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  /** Shown after a number, such as "mL" or "bpm". */
  unit?: string;
  min?: number;
  max?: number;
  /** A row can't be handed in without it. */
  required?: boolean;
  placeholder?: string;
}

export interface ReturnDemoForm {
  key: string;
  title: string;
  description: string;
  /** What one row is called, such as "Reading" or "Bottle". */
  rowLabel: string;
  fields: FormField[];
}

export const RETURN_DEMO_FORMS: readonly ReturnDemoForm[] = [
  {
    key: 'ivf',
    title: 'IV Fluid Monitoring Sheet',
    description: 'Each IV fluid hooked: the solution, its volume and rate, the site, and what was observed.',
    rowLabel: 'Bottle',
    fields: [
      { key: 'time', label: 'Time hooked', type: 'time', required: true },
      { key: 'solution', label: 'IV solution', type: 'text', required: true, placeholder: 'e.g. PNSS 1L' },
      { key: 'volume_ml', label: 'Volume', type: 'number', unit: 'mL', min: 0, max: 5000 },
      { key: 'rate_ml_hr', label: 'Rate', type: 'number', unit: 'mL/hr', min: 0, max: 1000 },
      { key: 'site', label: 'Site', type: 'text', placeholder: 'e.g. Left forearm, 20G' },
      { key: 'remarks', label: 'Remarks', type: 'longtext', placeholder: 'Site checks, infiltration, phlebitis…' },
    ],
  },
  {
    key: 'tpr',
    title: 'TPR Sheet',
    description: 'Temperature, pulse and respiration, one row per reading.',
    rowLabel: 'Reading',
    fields: [
      { key: 'time', label: 'Time', type: 'time', required: true },
      { key: 'temperature_c', label: 'Temperature', type: 'number', unit: '°C', min: 30, max: 45 },
      { key: 'pulse', label: 'Pulse', type: 'number', unit: 'bpm', min: 0, max: 300 },
      { key: 'respiration', label: 'Respiration', type: 'number', unit: '/min', min: 0, max: 100 },
      { key: 'remarks', label: 'Remarks', type: 'longtext' },
    ],
  },
  {
    key: 'vitals',
    title: 'Vital Signs Sheet',
    description: 'Blood pressure, heart and respiratory rate, temperature, oxygen saturation and pain, one row per reading.',
    rowLabel: 'Reading',
    fields: [
      { key: 'time', label: 'Time', type: 'time', required: true },
      { key: 'bp_systolic', label: 'BP systolic', type: 'number', unit: 'mmHg', min: 0, max: 300 },
      { key: 'bp_diastolic', label: 'BP diastolic', type: 'number', unit: 'mmHg', min: 0, max: 200 },
      { key: 'heart_rate', label: 'Heart rate', type: 'number', unit: 'bpm', min: 0, max: 300 },
      { key: 'respiratory_rate', label: 'Respiratory rate', type: 'number', unit: '/min', min: 0, max: 100 },
      { key: 'temperature_c', label: 'Temperature', type: 'number', unit: '°C', min: 30, max: 45 },
      { key: 'oxygen_saturation', label: 'SpO₂', type: 'number', unit: '%', min: 0, max: 100 },
      { key: 'pain_score', label: 'Pain', type: 'number', unit: '/10', min: 0, max: 10 },
      { key: 'remarks', label: 'Remarks', type: 'longtext' },
    ],
  },
];

export const MAX_FORM_ROWS = 50;
const MAX_TEXT = 500;
const MAX_LONGTEXT = 2000;

const BY_KEY = new Map(RETURN_DEMO_FORMS.map((f) => [f.key, f]));

export function formByKey(key: string): ReturnDemoForm | undefined {
  return BY_KEY.get(key);
}

/** Known form keys from a request body, first mention kept, in order. */
export function parseFormKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) if (typeof v === 'string' && BY_KEY.has(v) && !out.includes(v)) out.push(v);
  return out;
}

export type FormRow = Record<string, string | number | null>;

function cleanValue(field: FormField, raw: unknown): string | number | null {
  if (raw === null || raw === undefined) return null;
  if (field.type === 'number') {
    const n = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : raw;
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    if (field.min !== undefined && n < field.min) return null;
    if (field.max !== undefined && n > field.max) return null;
    return Math.round(n * 100) / 100;
  }
  if (typeof raw !== 'string') return null;
  const text = raw.trim();
  if (!text) return null;
  if (field.type === 'time') return /^([01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : null;
  return text.slice(0, field.type === 'longtext' ? MAX_LONGTEXT : MAX_TEXT);
}

/**
 * Keeps only the form's own fields, each to its type and range, and drops
 * rows left empty. Anything else in the body is dropped, so free-form keys
 * can't ride along into storage.
 */
export function sanitizeRows(form: ReturnDemoForm, value: unknown): FormRow[] {
  if (!Array.isArray(value)) return [];
  const rows: FormRow[] = [];
  for (const item of value.slice(0, MAX_FORM_ROWS)) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
    const src = item as Record<string, unknown>;
    const row: FormRow = {};
    let filled = false;
    for (const field of form.fields) {
      const v = cleanValue(field, src[field.key]);
      row[field.key] = v;
      if (v !== null) filled = true;
    }
    if (filled) rows.push(row);
  }
  return rows;
}

/** Why the rows can't be handed in yet, or null: at least one row, each with its required fields. */
export function missingInRows(form: ReturnDemoForm, rows: readonly FormRow[]): string | null {
  if (rows.length === 0) return `Add at least one ${form.rowLabel.toLowerCase()} to the ${form.title}.`;
  for (const [i, row] of rows.entries()) {
    const missing = form.fields.filter((f) => f.required && (row[f.key] === null || row[f.key] === undefined));
    if (missing.length > 0) {
      return `${form.rowLabel} ${i + 1} needs ${missing.map((f) => f.label.toLowerCase()).join(' and ')}.`;
    }
  }
  return null;
}

/** "120 mmHg", "08:30", "—" */
export function formatFieldValue(field: FormField, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  return field.unit && field.type === 'number' ? `${value} ${field.unit}` : String(value);
}
