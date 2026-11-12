/**
 * The forms an instructor can add to a Return Demonstration (migration 094),
 * and the rules a filled-in form is held to. A form is a printed document,
 * such as the DOH PhilPEN form: sections of fields the student answers on the
 * app, each tied to its place on the page, so the instructor sees the answers
 * written on the form itself.
 *
 * The database stores only form keys and the answers (one row of field key to
 * value in `entries`), so a form is added or changed here. Its page image is
 * web/public/forms/<image> and mobile/assets/forms/<image>.
 * mobile/lib/return-demo-forms.ts is a copy for the app: keep the two the same.
 *
 * Pure, so the API routes, the instructor pages and the demo share it.
 */

export type FormFieldType = 'text' | 'longtext' | 'number' | 'date' | 'bp' | 'choice' | 'multi';

/** A spot on the page, in PDF points from its top left. */
export interface PagePlace {
  x: number;
  y: number;
  /** Width of a blank, or of a box drawn round an option (with `h`). */
  w?: number;
  h?: number;
}

export interface FormOption {
  value: string;
  label: string;
  /** A short note beside the label, such as "<5%". */
  detail?: string;
  /** A colour band, such as the CVD risk chart's. */
  color?: string;
  /** Where this option's box is ticked (or circled, with w and h). */
  at?: PagePlace;
}

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  /** Shown after a number, such as "kg" or "mmHg". */
  unit?: string;
  min?: number;
  max?: number;
  /** It can't be handed in without it. */
  required?: boolean;
  placeholder?: string;
  /** A line of guidance under the label. */
  hint?: string;
  options?: FormOption[];
  /** Asked only when another field has this answer, such as "If yes, taking medications?". */
  showIf?: { field: string; value: string };
  /** Where a written answer goes on the page. */
  at?: PagePlace;
}

export interface FormSection {
  title: string;
  fields: FormField[];
}

export interface ReturnDemoForm {
  key: string;
  title: string;
  description: string;
  /** Who issues it, such as "Department of Health". */
  source: string;
  /** The printed page the answers are written on. */
  page: { image: string; width: number; height: number };
  sections: FormSection[];
}

const YES_NO = (yes: PagePlace, no: PagePlace): FormOption[] => [
  { value: 'yes', label: 'Yes', at: yes },
  { value: 'no', label: 'No', at: no },
];
const YES_NO_UNSURE = (yes: PagePlace, no: PagePlace, unsure: PagePlace): FormOption[] => [
  ...YES_NO(yes, no),
  { value: 'unsure', label: "I don't know", at: unsure },
];

export const RETURN_DEMO_FORMS: readonly ReturnDemoForm[] = [
  {
    key: 'philpen',
    title: 'PhilPEN Form',
    description: 'The DOH risk assessment for noncommunicable diseases, for adults 20 years and above.',
    source: 'Department of Health, updated PhilPEN Protocol 2025',
    page: { image: 'philpen-form.png', width: 420, height: 595 },
    sections: [
      {
        title: 'Client',
        fields: [
          { key: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Surname, Given name, Middle name', at: { x: 27, y: 135.5, w: 238 } },
          { key: 'assessed_on', label: 'Date of assessment', type: 'date', required: true, at: { x: 272, y: 135.5, w: 120 } },
          { key: 'address', label: 'Address', type: 'text', at: { x: 27, y: 160, w: 118 } },
          { key: 'birth_date', label: 'Birth date', type: 'date', at: { x: 149, y: 160, w: 118 } },
          { key: 'age', label: 'Age', type: 'number', unit: 'years', min: 0, max: 130, required: true, at: { x: 272, y: 160, w: 60 } },
          {
            key: 'sex',
            label: 'Sex',
            type: 'choice',
            required: true,
            options: [
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
            ],
            at: { x: 338, y: 160, w: 55 },
          },
        ],
      },
      {
        title: 'Measurements',
        fields: [
          { key: 'weight_kg', label: 'Weight', type: 'number', unit: 'kg', min: 1, max: 400, at: { x: 73, y: 177.2, w: 24 } },
          { key: 'height_cm', label: 'Height', type: 'number', unit: 'cm', min: 30, max: 250, at: { x: 190, y: 177.2, w: 24 } },
          { key: 'bmi', label: 'Body mass index (BMI)', type: 'number', unit: 'kg/m²', min: 5, max: 100, at: { x: 368, y: 177.2, w: 24 } },
          {
            key: 'bmi_class',
            label: 'BMI classification',
            type: 'choice',
            options: [
              { value: 'underweight', label: 'Underweight', detail: '<18.5' },
              { value: 'normal', label: 'Normal', detail: '18.5–22.9' },
              { value: 'overweight', label: 'Overweight', detail: '23–24.9' },
              { value: 'obese', label: 'Obese', detail: '≥25' },
            ],
            at: { x: 97, y: 186.3, w: 44 },
          },
          { key: 'waist_cm', label: 'Waist circumference', type: 'number', unit: 'cm', min: 30, max: 250, at: { x: 240, y: 186.3, w: 24 } },
        ],
      },
      {
        title: 'History',
        fields: [
          {
            key: 'cvd_ckd',
            label: 'History of heart attack, stroke, chronic kidney problem?',
            hint: 'If yes, automatic high risk (>20%) from prior CVD or chronic kidney problem.',
            type: 'choice',
            options: YES_NO({ x: 310.8, y: 200.7 }, { x: 344.1, y: 200.7 }),
          },
          {
            key: 'family_cvd',
            label: 'History of heart attack or stroke in a first-degree relative',
            type: 'choice',
            options: YES_NO({ x: 148.6, y: 247.1 }, { x: 177.9, y: 247.1 }),
          },
          {
            key: 'hypertension',
            label: 'Hypertension',
            type: 'choice',
            options: YES_NO_UNSURE({ x: 148.6, y: 279.2 }, { x: 177.9, y: 279.2 }, { x: 148.6, y: 289.8 }),
          },
          {
            key: 'hypertension_meds',
            label: 'Taking medications for hypertension?',
            type: 'choice',
            showIf: { field: 'hypertension', value: 'yes' },
            options: YES_NO({ x: 148.6, y: 306.1 }, { x: 177.9, y: 306.1 }),
          },
          {
            key: 'diabetes',
            label: 'Diabetes mellitus',
            type: 'choice',
            options: YES_NO_UNSURE({ x: 341.8, y: 235.3 }, { x: 369.1, y: 235.3 }, { x: 341.8, y: 245.9 }),
          },
          {
            key: 'diabetes_meds',
            label: 'Taking medications for diabetes?',
            type: 'choice',
            showIf: { field: 'diabetes', value: 'yes' },
            options: YES_NO({ x: 341.8, y: 261.9 }, { x: 373.1, y: 261.9 }),
          },
          {
            key: 'cholesterol',
            label: 'High cholesterol',
            type: 'choice',
            options: YES_NO_UNSURE({ x: 341.8, y: 284.7 }, { x: 369.1, y: 284.7 }, { x: 341.8, y: 295.5 }),
          },
          {
            key: 'cholesterol_meds',
            label: 'Taking medications for high cholesterol?',
            type: 'choice',
            showIf: { field: 'cholesterol', value: 'yes' },
            options: YES_NO({ x: 341.8, y: 311.6 }, { x: 369.1, y: 311.6 }),
          },
        ],
      },
      {
        title: 'Blood pressure (1st encounter)',
        fields: [
          { key: 'bp_1', label: '1st reading', type: 'bp', unit: 'mmHg', at: { x: 68, y: 348.6, w: 40 } },
          { key: 'bp_2', label: '2nd reading', type: 'bp', unit: 'mmHg', at: { x: 196, y: 348.6, w: 40 } },
          { key: 'bp_3', label: '3rd reading', type: 'bp', unit: 'mmHg', at: { x: 320, y: 348.6, w: 40 } },
          { key: 'bp_average', label: 'Average of 2nd and 3rd readings', type: 'bp', unit: 'mmHg', at: { x: 311, y: 330.1, w: 55 } },
        ],
      },
      {
        title: 'Lifestyle',
        fields: [
          { key: 'smoker', label: 'Current smoker', type: 'choice', options: YES_NO({ x: 139.4, y: 368.7 }, { x: 172.8, y: 368.7 }) },
          {
            key: 'binge_drinking',
            label: 'Binge drinking in the past year',
            type: 'choice',
            options: YES_NO({ x: 139.4, y: 388.9 }, { x: 172.8, y: 388.9 }),
          },
          {
            key: 'physical_activity',
            label: 'Moderate or vigorous physical activity for 150 minutes a week',
            hint: 'Spread throughout the week, with no more than 2 days apart.',
            type: 'choice',
            options: YES_NO({ x: 350.9, y: 382.2 }, { x: 374.2, y: 382.2 }),
          },
          {
            key: 'low_fruit_vegetable',
            label: 'Intake of fruits and vegetables below five portions',
            type: 'choice',
            options: YES_NO({ x: 332.9, y: 422.7 }, { x: 366.2, y: 422.7 }),
          },
        ],
      },
      {
        title: 'Risk and management',
        fields: [
          {
            key: 'cvd_risk',
            label: 'Nonlaboratory CVD risk',
            hint: 'From the WHO/ISH risk chart. At 10% or higher (orange, red, deep red), refer to a health facility for comprehensive risk screening and physician assessment.',
            type: 'choice',
            options: [
              { value: 'green', label: 'Green', detail: '<5%', color: '#7fb04f', at: { x: 80.2, y: 416.4, w: 49.2, h: 15.1 } },
              { value: 'yellow', label: 'Yellow', detail: '5% to <10%', color: '#f5e83a', at: { x: 80.2, y: 432.2, w: 49.2, h: 15.2 } },
              { value: 'orange', label: 'Orange', detail: '10% to <20%', color: '#f39a4c', at: { x: 80.2, y: 447.8, w: 49.2, h: 15.2 } },
              { value: 'red', label: 'Red', detail: '20% to <30%', color: '#e23d31', at: { x: 80.2, y: 463.7, w: 49.2, h: 15.1 } },
              { value: 'deep_red', label: 'Deep red', detail: '≥30%', color: '#8e1b14', at: { x: 80.2, y: 479.5, w: 49.2, h: 15.1 } },
            ],
          },
          {
            key: 'counselling',
            label: 'Counselling on',
            hint: 'Tick every one given.',
            type: 'multi',
            options: [
              { value: 'healthy_diet', label: 'Healthy diet', at: { x: 221, y: 478.7 } },
              { value: 'physical_activity', label: 'Physical activity', at: { x: 221, y: 489.5 } },
              { value: 'referred_bti', label: 'Referred for BTI', at: { x: 304.1, y: 478.7 } },
              { value: 'harmful_alcohol', label: 'Harmful use of alcohol', at: { x: 304.1, y: 489.5 } },
            ],
          },
          { key: 'next_assessment', label: 'Date of next risk assessment', type: 'date', at: { x: 326, y: 508.4, w: 66 } },
          { key: 'assessed_by', label: 'Assessed by', type: 'text', placeholder: 'Your name', at: { x: 222, y: 546, w: 84 } },
        ],
      },
    ],
  },
];

const MAX_TEXT = 500;
const MAX_LONGTEXT = 2000;

const BY_KEY = new Map(RETURN_DEMO_FORMS.map((f) => [f.key, f]));

export function formByKey(key: string): ReturnDemoForm | undefined {
  return BY_KEY.get(key);
}

/** Every field of a form, in order. */
export const formFields = (form: ReturnDemoForm): FormField[] => form.sections.flatMap((s) => s.fields);

/** Known form keys from a request body, first mention kept, in order. */
export function parseFormKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const v of value) if (typeof v === 'string' && BY_KEY.has(v) && !out.includes(v)) out.push(v);
  return out;
}

/** A form's answers, field key to value; a `multi` answer is its values joined with commas. */
export type FormRow = Record<string, string | number | null>;

/** Whether a field is asked, given the other answers (a follow-up only after its "yes"). */
export const isAsked = (field: FormField, answers: Readonly<Record<string, unknown>>): boolean =>
  !field.showIf || answers[field.showIf.field] === field.showIf.value;

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const BP = /^(\d{2,3})\s*\/\s*(\d{2,3})$/;

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
  switch (field.type) {
    case 'date':
      return ISO_DATE.test(text) ? text : null;
    case 'bp': {
      const m = BP.exec(text);
      return m ? `${Number(m[1])}/${Number(m[2])}` : null;
    }
    case 'choice':
      return field.options?.some((o) => o.value === text) ? text : null;
    case 'multi': {
      const picked = new Set(text.split(',').map((v) => v.trim()));
      const kept = (field.options ?? []).filter((o) => picked.has(o.value)).map((o) => o.value);
      return kept.length ? kept.join(',') : null;
    }
    default:
      return text.slice(0, field.type === 'longtext' ? MAX_LONGTEXT : MAX_TEXT);
  }
}

/**
 * The answers kept to the form's own fields, each to its type, as the one
 * row stored: none when nothing is answered. A follow-up whose question
 * isn't asked is dropped. Anything else in the body is dropped too, so
 * free-form keys can't ride along into storage.
 */
export function sanitizeRows(form: ReturnDemoForm, value: unknown): FormRow[] {
  const src = Array.isArray(value) ? value[0] : value;
  if (!src || typeof src !== 'object' || Array.isArray(src)) return [];
  const raw = src as Record<string, unknown>;
  const row: FormRow = {};
  let filled = false;
  for (const field of formFields(form)) row[field.key] = cleanValue(field, raw[field.key]);
  for (const field of formFields(form)) {
    if (!isAsked(field, row)) row[field.key] = null;
    if (row[field.key] !== null) filled = true;
  }
  return filled ? [row] : [];
}

/** Why the answers can't be handed in yet, or null: every required field that is asked. */
export function missingInRows(form: ReturnDemoForm, rows: readonly FormRow[]): string | null {
  const answers = rows[0] ?? {};
  const missing = formFields(form).filter(
    (f) => f.required && isAsked(f, answers) && (answers[f.key] === null || answers[f.key] === undefined),
  );
  if (missing.length === 0) return null;
  return `Fill in ${missing.map((f) => f.label.toLowerCase()).join(', ')} before submitting the ${form.title}.`;
}

/** How many of the questions asked are answered, for a progress line. */
export function answeredCount(form: ReturnDemoForm, answers: Readonly<Record<string, unknown>>): { answered: number; asked: number } {
  const asked = formFields(form).filter((f) => isAsked(f, answers));
  const answered = asked.filter((f) => answers[f.key] !== null && answers[f.key] !== undefined && answers[f.key] !== '');
  return { answered: answered.length, asked: asked.length };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "120/80 mmHg", "Nov 12, 2026", "Yes", "Healthy diet, Physical activity", "—" */
export function formatFieldValue(field: FormField, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field.type === 'date' && typeof value === 'string' && ISO_DATE.test(value)) {
    const [y, m, d] = value.split('-').map(Number);
    return `${MONTHS[m - 1]} ${d}, ${y}`;
  }
  if (field.type === 'choice') return field.options?.find((o) => o.value === value)?.label ?? String(value);
  if (field.type === 'multi') {
    const picked = String(value).split(',');
    return (field.options ?? []).filter((o) => picked.includes(o.value)).map((o) => o.label).join(', ') || '—';
  }
  return field.unit && (field.type === 'number' || field.type === 'bp') ? `${value} ${field.unit}` : String(value);
}
