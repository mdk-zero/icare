/**
 * Gives the existing students a past: finished scenarios and sat quizzes.
 *
 * seed-basic-cases.ts and seed-scenario-quizzes.ts build the ward and the
 * papers, but every student starts with an empty record — no attempts, no
 * competency standing, nothing for the faculty dashboards, the analytics
 * warehouse or the ML recommender to read. This fills that in.
 *
 * Two things make the output worth training on rather than just worth
 * looking at.
 *
 *   It is generated through the real code. Papers come from
 *   selectQuestionsForAttempt(), the same adaptive selector the student app
 *   uses, and competency standing from deriveCompetencyScoresForAttempt(),
 *   the same roll-up the submit route calls. A seed that reimplemented either
 *   would drift from the app the first time the real logic changed.
 *
 *   It has structure. Each student carries an ability and a list of
 *   competencies they are weak or strong at, and answers are drawn against
 *   that — so a student who is weak at Pharmacology misses medication
 *   questions consistently, across every quiz, the way a real one would.
 *   Uniform random answers would give the recommender nothing to find.
 *
 * Everything is deterministic: the RNG is seeded per student and attempt, so
 * a re-run reproduces the same history rather than a new random one.
 *
 * It fills the calendar. The history is a term of TERM_DAYS ending today: each
 * section works through its cases in back-to-back blocks, and each block's
 * quiz stays open for the whole block and is sat again as practice. Sittings
 * are planned per section, one a day, so every section has attempts on every
 * day of the term — the analytics trend has a point in every daily, weekly
 * and monthly bucket back to the term's start, up to today. Dates are
 * relative to the moment it runs, so re-running moves the term to the new
 * today.
 *
 * Scope and re-runs: this owns exactly the (student, scenario) and
 * (student, assessment) pairs listed below. Those are cleared and rebuilt on
 * each run; anything else in the database is left alone. Deleting an attempt
 * also drops its derived competency_scores, by the trigger migration 027
 * installs, so the roll-up never double-counts.
 *
 *   npx tsx scripts/seed-student-history.ts
 */

import { config } from 'dotenv';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { selectQuestionsForAttempt } from '../app/lib/assessment-selection';
import { deriveCompetencyScoresForAttempt } from '../app/lib/competency';
import { generateRandomPassword, hashPassword } from '../app/lib/auth/password';

config({ path: '.env.local' });

/** Deterministic RNG, so a re-run reproduces the same history. */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

interface Profile {
  email: string;
  /** Used only when the student does not exist yet; existing rows are left alone. */
  name: string;
  section: string;
  sex: 'male' | 'female';
  /** Baseline chance of answering a question correctly. */
  ability: number;
  /** Competency names this student reliably misses, and reliably gets. */
  weakAt: string[];
  strongAt: string[];
  /** Share of a scenario's task points they complete before it is finalized. */
  taskCompletion: number;
  /**
   * Share of their section's work they actually did, 0..1.
   *
   * Below 1 leaves the rest assigned but untouched — no attempt, no
   * submission, and past its deadline it reads as overdue. That absence is
   * the strongest at-risk signal there is, and a cohort where everyone
   * finished everything never produces it.
   */
  engagement: number;
}

/**
 * Ability is deliberately spread. A cohort where everyone scores the same
 * teaches a risk model nothing — it needs students who are actually at risk
 * and students who are plainly not.
 */
const PROFILES: Profile[] = [
  // ---- the four that already existed --------------------------------------
  {
    email: '23-74349@g.batstate-u.edu.ph',
    name: 'Linux Mandrake S. Adona',
    section: 'BSN 1101',
    sex: 'male',
    ability: 0.88,
    weakAt: [],
    strongAt: ['Safe and Quality Nursing Care', 'Records Management'],
    taskCompletion: 1,
    engagement: 1,
  },
  {
    email: '23-75538@g.batstate-u.edu.ph',
    name: 'Andre A. Cachola',
    section: 'BSN 1102',
    sex: 'male',
    ability: 0.72,
    weakAt: ['Pharmacology'],
    strongAt: ['Communication'],
    taskCompletion: 0.85,
    engagement: 1,
  },
  {
    email: 'cacholaandot@gmail.com',
    name: 'Andot S. Wong',
    section: 'BSN 1102',
    sex: 'male',
    ability: 0.45,
    weakAt: ['Pharmacology', 'Safe and Quality Nursing Care'],
    strongAt: [],
    taskCompletion: 0.5,
    engagement: 1,
  },
  {
    email: 'dotdot042822@gmail.com',
    name: 'Dotdot I. Corpuz',
    section: 'BSN 1102',
    sex: 'male',
    ability: 0.63,
    weakAt: ['Quality Improvement'],
    strongAt: ['Health Education'],
    taskCompletion: 0.7,
    engagement: 1,
  },

  // ---- BSN 1101, which had a single student ------------------------------
  {
    email: '23-80112@g.batstate-u.edu.ph',
    name: 'Bea R. Katigbak',
    section: 'BSN 1101',
    sex: 'female',
    ability: 0.81,
    weakAt: [],
    strongAt: ['Health Education', 'Communication'],
    taskCompletion: 0.95,
    engagement: 1,
  },
  {
    email: '23-80147@g.batstate-u.edu.ph',
    name: 'Miguel A. Panganiban',
    section: 'BSN 1101',
    sex: 'male',
    ability: 0.66,
    weakAt: ['Records Management'],
    strongAt: [],
    taskCompletion: 0.75,
    engagement: 1,
  },
  {
    email: '23-80233@g.batstate-u.edu.ph',
    name: 'Trisha Mae L. Macatangay',
    section: 'BSN 1101',
    sex: 'female',
    ability: 0.52,
    weakAt: ['Pharmacology'],
    strongAt: [],
    taskCompletion: 0.6,
    // Stopped after the first two. The gap is the point.
    engagement: 0.67,
  },
  {
    email: '23-80318@g.batstate-u.edu.ph',
    name: 'Kenji P. Villanueva',
    section: 'BSN 1101',
    sex: 'male',
    ability: 0.38,
    weakAt: ['Safe and Quality Nursing Care', 'Quality Improvement'],
    strongAt: [],
    taskCompletion: 0.4,
    engagement: 0.34,
  },
  {
    email: '23-80402@g.batstate-u.edu.ph',
    name: 'Angelica D. Manalo',
    section: 'BSN 1101',
    sex: 'female',
    ability: 0.74,
    weakAt: ['Communication'],
    strongAt: ['Safe and Quality Nursing Care'],
    taskCompletion: 0.9,
    engagement: 1,
  },

  // ---- BSN 1102 -----------------------------------------------------------
  {
    email: '23-80519@g.batstate-u.edu.ph',
    name: 'Jomar T. Dimaculangan',
    section: 'BSN 1102',
    sex: 'male',
    ability: 0.85,
    weakAt: [],
    strongAt: ['Pharmacology', 'Safe and Quality Nursing Care'],
    taskCompletion: 1,
    engagement: 1,
  },
  {
    email: '23-80624@g.batstate-u.edu.ph',
    name: 'Shaira Mae B. Aguilar',
    section: 'BSN 1102',
    sex: 'female',
    ability: 0.58,
    weakAt: ['Health Education'],
    strongAt: [],
    taskCompletion: 0.65,
    engagement: 1,
  },
  {
    email: '23-80730@g.batstate-u.edu.ph',
    name: 'Renz Carlo M. Ilagan',
    section: 'BSN 1102',
    sex: 'male',
    ability: 0.41,
    weakAt: ['Pharmacology', 'Quality Improvement'],
    strongAt: [],
    taskCompletion: 0.45,
    engagement: 0.67,
  },
  {
    email: '23-80845@g.batstate-u.edu.ph',
    name: 'Nicole Anne S. Perez',
    section: 'BSN 1102',
    sex: 'female',
    ability: 0.69,
    weakAt: [],
    strongAt: ['Records Management'],
    taskCompletion: 0.8,
    engagement: 1,
  },
  {
    email: '23-80951@g.batstate-u.edu.ph',
    name: 'Paulo G. Hernandez',
    section: 'BSN 1102',
    sex: 'male',
    ability: 0.33,
    weakAt: ['Safe and Quality Nursing Care', 'Pharmacology', 'Health Education'],
    strongAt: [],
    taskCompletion: 0.3,
    // Barely engaged: one piece of work, done badly. The clearest at-risk case.
    engagement: 0.34,
  },

  // ---- Michael Smith's three newer sections --------------------------------
  {
    email: '23-81104@g.batstate-u.edu.ph',
    name: 'Althea Mae R. Bautista',
    section: 'BSN 1103',
    sex: 'female',
    ability: 0.84,
    weakAt: [],
    strongAt: ['Health Education'],
    taskCompletion: 0.95,
    engagement: 1,
  },
  {
    email: '23-81137@g.batstate-u.edu.ph',
    name: 'Jerome C. Maligaya',
    section: 'BSN 1103',
    sex: 'male',
    ability: 0.61,
    weakAt: ['Quality Improvement'],
    strongAt: [],
    taskCompletion: 0.7,
    engagement: 1,
  },
  {
    email: '23-81169@g.batstate-u.edu.ph',
    name: 'Katrina L. Mercado',
    section: 'BSN 1103',
    sex: 'female',
    ability: 0.47,
    weakAt: ['Pharmacology', 'Health Education'],
    strongAt: [],
    taskCompletion: 0.55,
    engagement: 0.67,
  },
  {
    email: '23-81204@g.batstate-u.edu.ph',
    name: 'Emmanuel D. Rosales',
    section: 'BSN 1103',
    sex: 'male',
    ability: 0.36,
    weakAt: ['Safe and Quality Nursing Care', 'Quality Improvement'],
    strongAt: [],
    taskCompletion: 0.4,
    engagement: 0.34,
  },
  {
    email: '23-81238@g.batstate-u.edu.ph',
    name: 'Precious Joy A. Tolentino',
    section: 'BSN 1103',
    sex: 'female',
    ability: 0.77,
    weakAt: [],
    strongAt: ['Records Management'],
    taskCompletion: 0.9,
    engagement: 1,
  },
  {
    email: '23-81275@g.batstate-u.edu.ph',
    name: 'Aaron Kyle P. Navarro',
    section: 'BSN 1104',
    sex: 'male',
    ability: 0.9,
    weakAt: [],
    strongAt: ['Safe and Quality Nursing Care', 'Pharmacology'],
    taskCompletion: 1,
    engagement: 1,
  },
  {
    email: '23-81312@g.batstate-u.edu.ph',
    name: 'Bianca Rose T. Gutierrez',
    section: 'BSN 1104',
    sex: 'female',
    ability: 0.68,
    weakAt: ['Communication'],
    strongAt: [],
    taskCompletion: 0.8,
    engagement: 1,
  },
  {
    email: '23-81348@g.batstate-u.edu.ph',
    name: 'Christian Dave M. Lazaro',
    section: 'BSN 1104',
    sex: 'male',
    ability: 0.54,
    weakAt: ['Pharmacology'],
    strongAt: [],
    taskCompletion: 0.6,
    engagement: 1,
  },
  {
    email: '23-81383@g.batstate-u.edu.ph',
    name: 'Danica Mae S. Espiritu',
    section: 'BSN 1104',
    sex: 'female',
    ability: 0.4,
    weakAt: ['Quality Improvement', 'Records Management'],
    strongAt: [],
    taskCompletion: 0.45,
    engagement: 0.67,
  },
  {
    email: '23-81419@g.batstate-u.edu.ph',
    name: 'Enrico B. Pascual',
    section: 'BSN 1104',
    sex: 'male',
    ability: 0.73,
    weakAt: [],
    strongAt: ['Communication'],
    taskCompletion: 0.85,
    engagement: 1,
  },
  {
    email: '23-81456@g.batstate-u.edu.ph',
    name: 'Faith Angeline C. Ramos',
    section: 'BSN 1104',
    sex: 'female',
    ability: 0.31,
    weakAt: ['Safe and Quality Nursing Care', 'Pharmacology', 'Health Education'],
    strongAt: [],
    taskCompletion: 0.3,
    engagement: 0.34,
  },
  {
    email: '23-81492@g.batstate-u.edu.ph',
    name: 'Gabriel John V. Soriano',
    section: 'BSN 1105',
    sex: 'male',
    ability: 0.8,
    weakAt: [],
    strongAt: ['Quality Improvement'],
    taskCompletion: 0.9,
    engagement: 1,
  },
  {
    email: '23-81527@g.batstate-u.edu.ph',
    name: 'Hannah Mae D. Castillo',
    section: 'BSN 1105',
    sex: 'female',
    ability: 0.57,
    weakAt: ['Records Management'],
    strongAt: [],
    taskCompletion: 0.65,
    engagement: 1,
  },
  {
    email: '23-81564@g.batstate-u.edu.ph',
    name: 'Ivan Christopher A. Rivera',
    section: 'BSN 1105',
    sex: 'male',
    ability: 0.44,
    weakAt: ['Health Education'],
    strongAt: [],
    taskCompletion: 0.5,
    engagement: 0.67,
  },
  {
    email: '23-81598@g.batstate-u.edu.ph',
    name: 'Jasmine Faye R. Delos Reyes',
    section: 'BSN 1105',
    sex: 'female',
    ability: 0.86,
    weakAt: [],
    strongAt: ['Safe and Quality Nursing Care'],
    taskCompletion: 1,
    engagement: 1,
  },
];

interface WorkItem {
  scenario: string;
  quiz: string;
}

const FEVER: WorkItem = { scenario: 'Fever Workup: Vital Signs and a Nasopharyngeal Swab', quiz: 'Temperature, Pulse, Respiration, and Nasopharyngeal Swab' };
const DEHYDRATION: WorkItem = { scenario: 'Dehydration: Peripheral IV and Stool Culture', quiz: 'Peripheral IV Therapy, Stool Culture, and PPE' };
const POST_OP: WorkItem = { scenario: 'Post-Op Day One: Dressing, Breathing Exercises and Comfort', quiz: 'Wound Dressing, Post-Op Breathing Exercises, and Pain Relief' };
const HYPERTENSION: WorkItem = { scenario: 'New Hypertension: Accurate BP and Cardiovascular Assessment', quiz: 'Blood Pressure, Cardiovascular Assessment, and 12-Lead ECG' };
const ANAEMIA: WorkItem = { scenario: 'Anaemia and Dizziness: Fall Prevention and Safe Ambulation', quiz: 'Fall Prevention, Assisted Ambulation, and Venipuncture' };
const UTI: WorkItem = { scenario: 'UTI: Clean-Catch Urine and Oral Antibiotics', quiz: 'Clean-Catch Urine, Oral Medications, and Handwashing' };
const ASTHMA: WorkItem = { scenario: 'Asthma: Pulse Oximetry, Inhaler and Nebulizer', quiz: 'Pulse Oximetry, Inhalers, Nebulizers, and Nasal Cannula' };
const CELLULITIS: WorkItem = { scenario: 'Cellulitis with Diabetes: Glucose, Insulin and IV Antibiotic', quiz: 'Capillary Glucose, Insulin Injection, and IV Piggyback' };

/**
 * The cases each section works through over the term, in order, and so the
 * quizzes its students sit.
 *
 * An assigned scenario is visible to whoever teaches an assigned student
 * (lib/scenario-visibility.ts), so a section only draws on its own faculty's
 * cases. Michael Smith teaches BSN 1101 and 1103–1105 and rotates his five
 * through all four — each list is the same cycle started at a different
 * point, so no two of his sections sit the same quiz in the same block. Drei
 * Cachola's BSN 1102 keeps her three, and none of them cross over.
 */
const SECTION_WORK: Record<string, WorkItem[]> = {
  'BSN 1101': [FEVER, DEHYDRATION, POST_OP, HYPERTENSION, ANAEMIA],
  'BSN 1102': [UTI, ASTHMA, CELLULITIS],
  'BSN 1103': [HYPERTENSION, ANAEMIA, FEVER, DEHYDRATION, POST_OP],
  'BSN 1104': [DEHYDRATION, POST_OP, HYPERTENSION, ANAEMIA, FEVER],
  'BSN 1105': [ANAEMIA, FEVER, DEHYDRATION, POST_OP, HYPERTENSION],
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

/**
 * How far back the history reaches. Fourteen weeks, so the analytics page's
 * default three-month window is populated from its first week to today's.
 */
const TERM_DAYS = 98;
/** The last block's quiz stays open this long past today: it is still running. */
const OPEN_AHEAD_DAYS = 7;
/**
 * A block's quiz opens this long after its scenario is assigned — after the
 * student has worked the case — and stays open this long into the next
 * block, so a section is never between quizzes.
 */
const FIRST_SITTING_DAYS = 2;
/**
 * How often a section sits a quiz. Daily, so every day of the term holds
 * attempts from every section and the trend has no empty bucket at any range
 * the dashboard offers. Each student still sits only every few days; it is
 * the class between them that covers every day.
 */
const SITTING_STEP_DAYS = 1;

interface Block {
  /** When its scenario is assigned. */
  start: number;
  /** When the next block's scenario is. */
  end: number;
}

/** The window a block's quiz is open: from its first sitting until the next block's begins. */
function quizWindow(block: Block): { opens: number; closes: number } {
  return {
    opens: block.start + FIRST_SITTING_DAYS * DAY_MS,
    closes: block.end + FIRST_SITTING_DAYS * DAY_MS,
  };
}

/** A section's work as back-to-back blocks, one per case, spanning the term. */
function termBlocks(count: number, termStart: number): Block[] {
  const length = ((TERM_DAYS + OPEN_AHEAD_DAYS) * DAY_MS) / count;
  return Array.from({ length: count }, (_, k) => ({
    start: termStart + k * length,
    end: termStart + (k + 1) * length,
  }));
}

interface Sitting {
  at: number;
  /** Index into the section's members. */
  member: number;
  /** Index into the section's work, and so its blocks. */
  block: number;
}

/**
 * When each quiz sitting in a section happens, and who sits it.
 *
 * Planned per section rather than per student: nobody sits a quiz every week,
 * but between them a class does. Everyone who did block k (`doers[k]`) gets a
 * first sitting of its quiz, in shuffled order, and the block's remaining
 * slots go round the same order again as practice until the block closes.
 */
function planSittings(section: string, blocks: Block[], doers: number[][], now: number): Sitting[] {
  const sittings: Sitting[] = [];
  blocks.forEach((block, k) => {
    const rng = seeded(hash(`${section}|block ${k}`));
    const order = [...doers[k]];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    const { opens, closes } = quizWindow(block);
    // Nothing in the future, and nothing so recent its submission would be.
    const last = Math.min(closes, now - 2 * HOUR_MS);
    if (order.length === 0 || last - opens < HOUR_MS) return;
    // A window too short to seat everyone at the usual spacing packs tighter.
    const step = Math.min(SITTING_STEP_DAYS * DAY_MS, (last - opens) / order.length);
    // Some time in each slot's school day, 09:00–17:00 Manila (UTC+8). Slots
    // count by calendar day, so today's is kept once its school day has begun
    // even though the slot itself falls later than `last`.
    const schoolDay = (slot: number) => slot - (slot % DAY_MS) + HOUR_MS;
    for (let i = 0; schoolDay(opens + i * step) <= last; i++) {
      const at = Math.min(schoolDay(opens + i * step) + rng() * 8 * HOUR_MS, last);
      sittings.push({ at, member: order[i % order.length], block: k });
    }
  });
  return sittings.sort((x, y) => x.at - y.at);
}

/** The Monday (UTC) starting the week `ms` falls in — Postgres's date_trunc('week'). */
function weekOf(ms: number): string {
  const d = new Date(ms);
  const sinceMonday = (d.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - sinceMonday))
    .toISOString()
    .slice(0, 10);
}

/**
 * Probability this student answers a given question correctly.
 *
 * Their weaknesses and strengths are competency names, and a question carries
 * the competencies it was tagged with — so the same student misses the same
 * kind of question wherever it appears.
 */
function chanceCorrect(profile: Profile, competencyNames: string[]): number {
  let p = profile.ability;
  if (competencyNames.some((n) => profile.weakAt.includes(n))) p -= 0.3;
  if (competencyNames.some((n) => profile.strongAt.includes(n))) p += 0.12;
  return Math.min(0.97, Math.max(0.08, p));
}

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
    process.exit(1);
  }
  const supabase: SupabaseClient = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ---- Create any student in the roster that does not exist yet ---------
  const { data: sections } = await supabase.from('sections').select('id, name');
  const sectionByName = new Map((sections ?? []).map((r) => [r.name, r.id]));

  const { data: before } = await supabase.from('users').select('email').eq('role', 'student');
  const existing = new Set((before ?? []).map((r) => r.email));
  const credentials: string[] = [];

  for (const profile of PROFILES) {
    if (existing.has(profile.email)) continue;
    const sectionId = sectionByName.get(profile.section);
    if (!sectionId) {
      console.error(`  ✗ ${profile.email}: no section named "${profile.section}"`);
      process.exit(1);
    }
    // Same shape the admin invite flow creates: a temporary password the
    // student must change at first login.
    //
    // Only the hash is stored, so a generated one exists solely in the line
    // printed below — lose that and the account is unreachable. Set
    // SEED_STUDENT_PASSWORD to give every seeded student the same known
    // password instead, which is usually what you want for a dev cohort you
    // intend to log in as.
    const password = process.env.SEED_STUDENT_PASSWORD || generateRandomPassword();
    const { error } = await supabase.from('users').insert({
      email: profile.email,
      name: profile.name,
      role: 'student',
      sex: profile.sex,
      section_id: sectionId,
      password_hash: await hashPassword(password),
      force_password_change: true,
    });
    if (error) {
      console.error(`  ✗ ${profile.email}:`, error.message);
      process.exit(1);
    }
    credentials.push(`  ${profile.email.padEnd(32)} ${password}`);
  }
  if (credentials.length > 0) {
    console.log(`Created ${credentials.length} student(s). Temporary passwords:`);
    for (const line of credentials) console.log(line);
    if (!process.env.SEED_STUDENT_PASSWORD) {
      console.log(
        '\n  These were randomly generated and are not stored anywhere. Keep them,\n' +
          '  or re-run with SEED_STUDENT_PASSWORD set to choose your own.',
      );
    }
    console.log('');
  }

  // ---- Look up everything this seed refers to by name -------------------
  const { data: students } = await supabase
    .from('users')
    .select('id, email, name, section_id, sections(name)')
    .eq('role', 'student');

  const { data: scenarios } = await supabase.from('scenarios').select('id, title');
  const { data: assessments } = await supabase.from('assessments').select('id, title');
  const { data: competencies } = await supabase.from('competency_areas').select('id, name');

  const scenarioByTitle = new Map((scenarios ?? []).map((s) => [s.title, s.id]));
  const assessmentByTitle = new Map((assessments ?? []).map((a) => [a.title, a.id]));
  const competencyName = new Map((competencies ?? []).map((c) => [c.id, c.name]));

  // Faculty who teach each section, for assigned_by / finalized_by.
  const { data: facultyLinks } = await supabase
    .from('faculty_sections')
    .select('faculty_id, section_id');
  const facultyBySection = new Map(
    (facultyLinks ?? []).map((l) => [l.section_id, l.faculty_id]),
  );

  // Every question's competency tags, so an answer can be drawn against the
  // student's actual weaknesses rather than a coin flip.
  const { data: tags } = await supabase
    .from('question_competencies')
    .select('question_id, competency_id');
  const tagsByQuestion = new Map<string, string[]>();
  for (const t of tags ?? []) {
    const names = tagsByQuestion.get(t.question_id) ?? [];
    names.push(competencyName.get(t.competency_id) ?? '');
    tagsByQuestion.set(t.question_id, names);
  }

  const { data: allQuestions } = await supabase
    .from('questions')
    .select('id, correct_index, options');
  const questionById = new Map((allQuestions ?? []).map((q) => [q.id, q]));

  let scenarioCount = 0;
  let attemptCount = 0;
  let taskCount = 0;
  let skippedScenarios = 0;
  let skippedQuizzes = 0;
  const coverage: string[] = [];

  const now = Date.now();
  const termStart = now - TERM_DAYS * DAY_MS;

  // Every day and week of the term, to check each section's sittings against.
  const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const termDays = new Set<string>();
  for (let t = termStart + FIRST_SITTING_DAYS * DAY_MS; t < now; t += DAY_MS) termDays.add(dayOf(t));
  termDays.add(dayOf(now));
  const termWeeks = new Set([...termDays].map((day) => weekOf(Date.parse(day))));

  // Sittings are planned per section, so group the students first — by the
  // section the database has them in, which is what decides their work.
  interface Member {
    profile: Profile;
    studentId: string;
    facultyId: string | null;
    /** Work beyond this index was assigned and never touched. */
    didCount: number;
  }
  const bySection = new Map<string, Member[]>();
  for (const profile of PROFILES) {
    const student = (students ?? []).find((s) => s.email === profile.email);
    if (!student) {
      console.warn(`  skipped ${profile.email} — no such student`);
      continue;
    }
    const sectionName =
      (student as unknown as { sections: { name: string } | null }).sections?.name ?? '';
    const work = SECTION_WORK[sectionName];
    if (!work) {
      console.warn(`  skipped ${profile.email} — section "${sectionName}" has no work defined`);
      continue;
    }
    const members = bySection.get(sectionName) ?? [];
    members.push({
      profile,
      studentId: student.id,
      facultyId: facultyBySection.get(student.section_id) ?? null,
      didCount: Math.max(1, Math.round(profile.engagement * work.length)),
    });
    bySection.set(sectionName, members);
  }

  // Sections share no students and no rows, so they are built side by side —
  // one after another, the term's ~500 sittings take the better part of an hour.
  await Promise.all([...bySection].map(async ([sectionName, members]) => {
    const work = SECTION_WORK[sectionName];
    const blocks = termBlocks(work.length, termStart);

    // ---- Scenarios ------------------------------------------------------
    for (const member of members) {
      for (const [k, item] of work.entries()) {
        const completed = k < member.didCount;
        const scenarioId = scenarioByTitle.get(item.scenario);
        if (!scenarioId) {
          console.warn(`  missing scenario "${item.scenario}" — run db:seed:basic-cases first`);
          continue;
        }
        const rng = seeded(hash(`${member.profile.email}|${item.scenario}`));

        // This pair is ours: clear it so a re-run rebuilds rather than stacks.
        const { data: old } = await supabase
          .from('scenario_assignments')
          .select('id')
          .eq('scenario_id', scenarioId)
          .eq('student_id', member.studentId);
        for (const row of old ?? []) {
          await supabase.from('scenario_assignments').delete().eq('id', row.id);
        }

        // The scenario opens its block; the student works it within a day,
        // before its quiz opens.
        const assignedAt = new Date(blocks[k].start);
        const submittedAt = new Date(assignedAt.getTime() + (0.5 + rng() * 0.5) * DAY_MS);
        const completedAt = new Date(submittedAt.getTime() + 6 * HOUR_MS);

        const deadline = new Date(assignedAt.getTime() + 7 * DAY_MS);
        // Untouched work that is past its deadline is overdue, not pending —
        // the same distinction the app makes, and the one faculty act on.
        const openStatus = deadline.getTime() < now ? 'overdue' : 'pending';

        const { data: assignment, error: aErr } = await supabase
          .from('scenario_assignments')
          .insert({
            scenario_id: scenarioId,
            student_id: member.studentId,
            assigned_by: member.facultyId,
            assigned_at: assignedAt.toISOString(),
            deadline: deadline.toISOString(),
            status: completed ? 'completed' : openStatus,
            required: true,
            submitted_at: completed ? submittedAt.toISOString() : null,
            time_taken: completed ? 1800 + Math.round(rng() * 2400) : null,
            completed_at: completed ? completedAt.toISOString() : null,
            finalized_by: completed ? member.facultyId : null,
            score: completed ? 0 : null, // replaced below once tasks are known
          })
          .select('id')
          .single();
        if (aErr || !assignment) {
          console.error(`  ✗ ${member.profile.email} / ${item.scenario}:`, aErr?.message);
          process.exit(1);
        }

        if (!completed) {
          skippedScenarios += 1;
          continue;
        }

        const { data: tasks } = await supabase
          .from('scenario_tasks')
          .select('id, points, verification')
          .eq('scenario_id', scenarioId)
          .order('sort_order', { ascending: true });

        const done = (tasks ?? []).filter(() => rng() < member.profile.taskCompletion);
        if (done.length > 0) {
          await supabase.from('scenario_task_completions').insert(
            done.map((t) => ({
              assignment_id: assignment.id,
              task_id: t.id,
              // A system task is closed by the student's own charting; a
              // faculty task by the faculty member signing it off.
              completed_by: t.verification === 'system' ? member.studentId : member.facultyId,
              completed_via: t.verification,
              completed_at: submittedAt.toISOString(),
            })),
          );
          taskCount += done.length;
        }

        // Same formula the finalize route uses: share of task points earned.
        const totalPoints = (tasks ?? []).reduce((sum, t) => sum + (t.points ?? 0), 0);
        const earned = done.reduce((sum, t) => sum + (t.points ?? 0), 0);
        const score = totalPoints > 0 ? Math.round((earned / totalPoints) * 100) : 0;
        await supabase.from('scenario_assignments').update({ score }).eq('id', assignment.id);
        scenarioCount += 1;
      }
    }

    // ---- Quiz assignments -----------------------------------------------
    // One per student per quiz, due when its window closes, so every practice
    // sitting below falls inside the window the student could sit it.
    const assignmentIds = new Map<string, string | null>();
    for (const member of members) {
      for (const [k, item] of work.entries()) {
        const assessmentId = assessmentByTitle.get(item.quiz);
        if (!assessmentId) {
          console.warn(`  missing quiz "${item.quiz}" — run db:seed:scenario-quizzes first`);
          continue;
        }

        // Ours to rebuild. Attempts cascade to answers, served questions and
        // criteria scores; the 027 trigger takes the derived competency scores.
        const { data: oldAttempts } = await supabase
          .from('assessment_attempts')
          .select('id')
          .eq('assessment_id', assessmentId)
          .eq('student_id', member.studentId);
        for (const row of oldAttempts ?? []) {
          await supabase.from('assessment_attempts').delete().eq('id', row.id);
        }
        const { data: oldAssign } = await supabase
          .from('assessment_assignments')
          .select('id')
          .eq('assessment_id', assessmentId)
          .eq('student_id', member.studentId);
        for (const row of oldAssign ?? []) {
          await supabase.from('assessment_assignments').delete().eq('id', row.id);
        }

        const sat = k < member.didCount;
        const { closes } = quizWindow(blocks[k]);
        const { data: quizAssignment } = await supabase
          .from('assessment_assignments')
          .insert({
            assessment_id: assessmentId,
            student_id: member.studentId,
            assigned_by: member.facultyId,
            assigned_at: new Date(blocks[k].start).toISOString(),
            deadline: new Date(closes).toISOString(),
            status: sat ? 'completed' : closes < now ? 'overdue' : 'pending',
            required: true,
          })
          .select('id')
          .single();
        assignmentIds.set(`${member.studentId}|${assessmentId}`, quizAssignment?.id ?? null);

        // Assigned but never sat: the row stands, with no attempt behind it.
        if (!sat) skippedQuizzes += 1;
      }
    }

    // ---- Quiz sittings --------------------------------------------------
    const doers = blocks.map((_, k) =>
      members.flatMap((member, i) => (k < member.didCount ? [i] : [])),
    );
    const sittings = planSittings(sectionName, blocks, doers, now);
    const sittingsSoFar = new Map<string, number>();
    const daysCovered = new Set<string>();

    // Chronological, so the selector sees each student's earlier sittings of
    // a quiz and prefers questions they have not met.
    for (const planned of sittings) {
      const member = members[planned.member];
      const item = work[planned.block];
      const assessmentId = assessmentByTitle.get(item.quiz);
      if (!assessmentId) continue;
      const key = `${member.studentId}|${assessmentId}`;
      const sitting = sittingsSoFar.get(key) ?? 0;
      sittingsSoFar.set(key, sitting + 1);

      const rng = seeded(hash(`${member.profile.email}|${item.quiz}|${sitting}`));

      // The real selector, so a practice sitting is served the way the
      // student app would serve it.
      const selection = await selectQuestionsForAttempt(supabase, {
        assessmentId,
        studentId: member.studentId,
        rng,
      });

      const startedAt = new Date(planned.at);
      const { data: attempt, error: atErr } = await supabase
        .from('assessment_attempts')
        .insert({
          assessment_id: assessmentId,
          student_id: member.studentId,
          assignment_id: assignmentIds.get(key) ?? null,
          status: 'in_progress',
          started_at: startedAt.toISOString(),
        })
        .select('id')
        .single();
      if (atErr || !attempt) {
        console.error(`  ✗ ${member.profile.email} / ${item.quiz}:`, atErr?.message);
        process.exit(1);
      }

      await supabase.from('attempt_questions').insert(
        selection.questions.map((q) => ({
          attempt_id: attempt.id,
          question_id: q.id,
          criteria_id: q.criteria_id,
          position: q.position,
        })),
      );

      // Answer each served question against the profile. Later sittings get
      // a modest lift — practice helps — capped so a fourth go is no
      // guaranteed pass.
      const lift = Math.min(sitting, 2) * 0.08;
      const answers = selection.questions.map((q) => {
        const question = questionById.get(q.id);
        const correctIndex = question?.correct_index ?? 0;
        const optionCount = Array.isArray(question?.options) ? question.options.length : 4;
        const p = Math.min(0.97, chanceCorrect(member.profile, tagsByQuestion.get(q.id) ?? []) + lift);
        const isCorrect = rng() < p;
        let selected = correctIndex;
        if (!isCorrect) {
          // Land on a wrong option rather than "no answer": an unanswered
          // question and a wrong one are different signals downstream.
          const offset = 1 + Math.floor(rng() * (optionCount - 1));
          selected = (correctIndex + offset) % optionCount;
        }
        return {
          attempt_id: attempt.id,
          question_id: q.id,
          selected_index: selected,
          is_correct: isCorrect,
          time_spent_seconds: 20 + Math.round(rng() * 70),
          answered_at: startedAt.toISOString(),
        };
      });
      await supabase.from('attempt_answers').insert(answers);

      const correctByQuestion = new Map(answers.map((a) => [a.question_id, a.is_correct]));
      const correctCount = answers.filter((a) => a.is_correct).length;
      const score = Math.round((correctCount / answers.length) * 10000) / 100;

      // Same per-criterion arithmetic as the submit route, over the paper
      // this attempt was actually served.
      const { data: criteria } = await supabase
        .from('assessment_criteria')
        .select('id, name, weight, competency_id')
        .eq('assessment_id', assessmentId)
        .order('sort_order', { ascending: true });

      const breakdown = (criteria ?? []).map((c) => {
        const mine = selection.questions.filter((q) => q.criteria_id === c.id);
        const total = mine.length;
        const correct = mine.filter((q) => correctByQuestion.get(q.id)).length;
        const pct = total > 0 ? Math.round((correct / total) * 10000) / 100 : 0;
        return {
          attempt_id: attempt.id,
          criteria_id: c.id,
          competency_id: c.competency_id,
          criteria_name: c.name,
          weight: c.weight,
          correct,
          total,
          score: pct,
          weighted_score: Math.round(pct * (Number(c.weight) / 100) * 100) / 100,
        };
      });
      if (breakdown.length > 0) {
        await supabase.from('attempt_criteria_scores').insert(breakdown);
      }

      const timeTaken = answers.reduce((sum, a) => sum + (a.time_spent_seconds ?? 0), 0);
      const submittedAt = startedAt.getTime() + timeTaken * 1000;
      await supabase
        .from('assessment_attempts')
        .update({
          status: 'submitted',
          submitted_at: new Date(submittedAt).toISOString(),
          score,
          time_taken_seconds: timeTaken,
        })
        .eq('id', attempt.id);

      // The app's own roll-up, so competency standing matches what a real
      // submission would have produced.
      await deriveCompetencyScoresForAttempt(supabase, attempt.id);

      attemptCount += 1;
      // The warehouse dates an attempt by its submission, so that is the
      // day it counts toward on the trend chart.
      daysCovered.add(dayOf(submittedAt));
    }

    const weeksCovered = new Set([...daysCovered].map((day) => weekOf(Date.parse(day))));
    const missing = [...termDays].filter((day) => !daysCovered.has(day));
    coverage.push(
      `  ${sectionName.padEnd(10)} ${String(sittings.length).padStart(3)} sittings  ` +
        `${daysCovered.size}/${termDays.size} days  ${weeksCovered.size}/${termWeeks.size} weeks` +
        (missing.length > 0 ? `  — none on ${missing.join(', ')}` : ''),
    );
  }));

  console.log(
    `\nScenarios: ${scenarioCount} completed (${taskCount} task check-offs), ` +
      `${skippedScenarios} left outstanding.\n` +
      `Quizzes: ${attemptCount} attempts submitted, ${skippedQuizzes} assignments never sat.\n`,
  );
  console.log('Sittings per section, against the days and weeks of the term:');
  for (const line of coverage.sort()) console.log(line);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
