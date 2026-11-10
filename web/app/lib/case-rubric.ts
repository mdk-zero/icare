/**
 * Case presentations by group (migration 093): the rubric a group's
 * presentation is graded on, and the files a leader may hand in.
 *
 * The rubric is the clinical instructors' Case Presentation rubric: six
 * weighted criteria, each rated on four levels. A criterion earns its weight
 * times level ÷ 4, so all Excellent is 100.
 */

export type CaseLevel = 1 | 2 | 3 | 4;

export const CASE_LEVELS: readonly { value: CaseLevel; label: string }[] = [
  { value: 4, label: 'Excellent' },
  { value: 3, label: 'Proficient' },
  { value: 2, label: 'Developing' },
  { value: 1, label: 'Beginning' },
];

export interface CaseCriterion {
  key: string;
  label: string;
  /** Percent of the grade; the six add up to 100. */
  weight: number;
  /** What each level looks like, by level. */
  levels: Record<CaseLevel, string>;
}

/** The keys are stored in case_group_ratings.criterion. */
export const CASE_CRITERIA: readonly CaseCriterion[] = [
  {
    key: 'assessment',
    label: 'Patient Assessment & Baseline Data',
    weight: 15,
    levels: {
      4: 'Comprehensive physical assessment and history. Accurately identifies all critical baseline data (hemodynamics, GCS, ABCs) specific to the high-acuity setting.',
      3: 'Thorough assessment with minor omissions. Most critical baseline data is identified and accurately presented.',
      2: 'Incomplete assessment. Misses some key critical care parameters or baseline data relevant to the emergency/ICU context.',
      1: 'Poor/inaccurate assessment. Fails to identify life-threatening baseline parameters.',
    },
  },
  {
    key: 'pathophysiology',
    label: 'Pathophysiology',
    weight: 20,
    levels: {
      4: "Traces the disease process down to the cellular/systemic level with a highly accurate, customized schematic diagram linking to the patient's exact multi-organ manifestations.",
      3: 'Accurately traces the disease process using a diagram but lacks some patient-specific clinical manifestations or multi-organ links.',
      2: "Generic pathophysiology presented. Not customized to the patient's specific critical condition or clinical presentation.",
      1: 'Inaccurate or severely fragmented pathophysiology. Fails to explain the life-threatening mechanism of the disease.',
    },
  },
  {
    key: 'diagnostics',
    label: 'Diagnostics & Medical Management',
    weight: 15,
    levels: {
      4: "Comprehensively analyzes labs, diagnostics (ECG, ABG, etc.), and pharmacology. Correlates all medical/surgical interventions with the patient's acute status.",
      3: "Analyzes most labs and medications accurately. Minor gaps in correlating medical management with the patient's critical condition.",
      2: "Lists labs and medications without providing adequate analysis or correlation to the patient's high-acuity needs.",
      1: 'Missing or inaccurate interpretation of critical diagnostics and life-saving medical management.',
    },
  },
  {
    key: 'care_plan',
    label: 'Nursing Care Plan (Prioritization & Interventions)',
    weight: 30,
    levels: {
      4: 'NCP is flawless. Prioritizes life-threatening problems (e.g., airway, hemodynamics). Interventions are evidence-based, highly specific to critical care, with SMART goals fully evaluated.',
      3: 'NCP is good. Prioritizes appropriately but some interventions lack critical care specificity. Goals are SMART and evaluated.',
      2: 'NCP lacks appropriate high-acuity prioritization. Goals are vague; interventions are generic and not suited for emergency/ICU settings.',
      1: 'NCP is poorly constructed, prioritizes incorrectly (e.g., prioritizes pain over airway), and lacks evidence-based rationale.',
    },
  },
  {
    key: 'presentation',
    label: 'Presentation Skills & Use of AV Materials',
    weight: 10,
    levels: {
      4: 'Delivery is confident, clear, and perfectly timed. Audiovisual materials (slides, charts) are highly professional, visually engaging, and enhance understanding.',
      3: 'Delivery is mostly clear and on time. AV materials are good but may have minor formatting or text-density issues.',
      2: 'Delivery is hesitant or read directly from notes. Time management is poor. AV materials are distracting or hard to read.',
      1: 'Disorganized, lacks professionalism, exceeds time limits significantly, or AV materials are missing/illegible.',
    },
  },
  {
    key: 'critical_thinking',
    label: 'Critical Thinking (Q&A/Defense)',
    weight: 10,
    levels: {
      4: 'Defends the case flawlessly. Demonstrates exceptional clinical judgment and depth of knowledge regarding emergency/intensive care concepts when questioned.',
      3: 'Answers most questions accurately. Shows solid understanding of critical care concepts with only minor hesitations.',
      2: 'Struggles to answer questions. Demonstrates superficial understanding of the critical care implications of the case.',
      1: "Unable to answer clinical questions. Lacks fundamental understanding of the patient's life-threatening condition.",
    },
  },
];

const CRITERION_KEYS = new Set(CASE_CRITERIA.map((c) => c.key));

export function isCaseCriterion(key: unknown): key is string {
  return typeof key === 'string' && CRITERION_KEYS.has(key);
}

export function isCaseLevel(value: unknown): value is CaseLevel {
  return value === 1 || value === 2 || value === 3 || value === 4;
}

export function caseLevelLabel(level: number): string {
  return CASE_LEVELS.find((l) => l.value === level)?.label ?? '';
}

/** 0–100, to two decimals; a criterion nobody rated earns nothing. */
export function caseScore(ratings: ReadonlyMap<string, number>): number {
  const total = CASE_CRITERIA.reduce((sum, c) => {
    const level = ratings.get(c.key);
    return sum + (isCaseLevel(level) ? (c.weight * level) / 4 : 0);
  }, 0);
  return Math.round(total * 100) / 100;
}

export function allCriteriaRated(ratings: ReadonlyMap<string, number>): boolean {
  return CASE_CRITERIA.every((c) => isCaseLevel(ratings.get(c.key)));
}

export function isLateSubmission(submittedAt: string | null, deadline: string | null): boolean {
  if (!submittedAt || !deadline) return false;
  return new Date(submittedAt).getTime() > new Date(deadline).getTime();
}

// ─── The group's file ────────────────────────────────────────────────────────

export const CASE_BUCKET = 'case-presentations';

/** Largest upload, matching the bucket's file_size_limit. */
export const MAX_CASE_FILE_BYTES = 50 * 1024 * 1024;

export type CaseFileType = 'pdf' | 'pptx';

const CASE_FILE_MIMES: Record<string, CaseFileType> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
};

/** The type of a hand-in from its MIME type or, failing that, its extension; null when it isn't PDF or PPTX. */
export function caseFileTypeOf(mime: string, fileName: string): CaseFileType | null {
  if (mime && CASE_FILE_MIMES[mime]) return CASE_FILE_MIMES[mime];
  const ext = /\.([a-z0-9]+)$/i.exec(fileName)?.[1]?.toLowerCase();
  return ext === 'pdf' || ext === 'pptx' ? ext : null;
}
