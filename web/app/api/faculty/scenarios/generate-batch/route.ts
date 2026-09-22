import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callAI, aiErrorResponse } from '@/app/lib/ai/generate';
import { MAX_LESSON_CHARS } from '@/app/lib/ai/lesson';
import { listCategories, matchCategory } from '@/app/lib/scenario-categories';
import {
  PATIENT_CONTEXT_COLUMNS,
  SCENARIO_GUIDELINES,
  SCENARIO_JSON_SHAPE,
  isValidDifficulty,
  lessonBlock,
  patientRecordBlock,
  sanitizeScenario,
  type PatientContext,
  type ScenarioDifficulty,
  type SanitizedScenario,
} from '@/app/lib/ai/scenario';

// A 12-scenario library is three sequential AI calls; the default 10s budget is not enough.
export const maxDuration = 60;

const MAX_BATCH = 12;
/** Both providers cap output at 4096 tokens, which fits roughly four full scenarios. */
const CHUNK_SIZE = 4;
const DIFFICULTY_CYCLE: ScenarioDifficulty[] = ['beginner', 'intermediate', 'advanced'];

/** One scenario the AI has been asked to write, with the slot it must fill. */
interface PlannedSlot {
  category: string;
  difficulty: ScenarioDifficulty;
  patient: PatientContext | null;
}

function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

function forbiddenResponse() {
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Spreads the requested count across categories and difficulties so the library
 * comes out varied instead of ten takes on the same case.
 */
function planSlots(
  count: number,
  categories: string[],
  allCategories: string[],
  difficulty: ScenarioDifficulty | null,
  patients: PatientContext[],
): PlannedSlot[] {
  const categoryPool = categories.length > 0 ? categories : shuffle(allCategories);

  return Array.from({ length: count }, (_, i) => ({
    category: categoryPool[i % categoryPool.length],
    difficulty: difficulty ?? DIFFICULTY_CYCLE[i % DIFFICULTY_CYCLE.length],
    patient: patients.length > 0 ? patients[i % patients.length] : null,
  }));
}

function buildBatchPrompt(
  slots: PlannedSlot[],
  topic: string,
  existingTitles: string[],
  lessonText: string,
): string {
  const briefs = slots
    .map((slot, i) => {
      const patientBlock = slot.patient
        ? `\n   Base it on ${patientRecordBlock(slot.patient, 'patient record')}`
        : '';
      return `${i + 1}. Category: "${slot.category}" — Difficulty: "${slot.difficulty}"${patientBlock}`;
    })
    .join('\n\n');

  const topicBlock = topic
    ? `\nEvery scenario must relate to this teaching focus: "${topic.replace(/"/g, '\\"')}".\n`
    : '';

  // With a lesson, the briefs' categories are the lesson topics the faculty
  // member picked — one scenario per topic, each applying the lesson.
  const lesson = lessonText
    ? `${lessonBlock(lessonText)}Each brief's category is the lesson topic its scenario centres on. Where a brief includes a patient record, keep that patient's diagnosis and vitals and apply the lesson to their care.\n`
    : '';

  const avoidBlock =
    existingTitles.length > 0
      ? `\nThese scenarios already exist in the library — do not repeat their clinical situations or titles:\n${existingTitles.map((t) => `- ${t}`).join('\n')}\n`
      : '';

  return `You are a clinical nursing education expert building a library of simulation scenarios for nursing students.

Write ${slots.length} DISTINCT scenarios. Each must cover a different clinical situation — no two may share a diagnosis or chief complaint.
${topicBlock}${lesson}${avoidBlock}
Write one scenario for each numbered brief below, in the same order:

${briefs}

Return ONLY a valid JSON object with this exact structure (no markdown, no explanations):

{
  "scenarios": [
${SCENARIO_JSON_SHAPE.split('\n').map((line) => `    ${line}`).join('\n')}
  ]
}

The "scenarios" array must contain exactly ${slots.length} objects, in the same order as the briefs, and each object's "category" and "difficulty" must match its brief.

Guidelines:
${SCENARIO_GUIDELINES}`;
}

/** One AI call covering up to CHUNK_SIZE slots. Throws if the model returns nothing usable. */
async function generateChunk(
  slots: PlannedSlot[],
  topic: string,
  existingTitles: string[],
  lessonText: string,
): Promise<(SanitizedScenario & { patient_id: string | null })[]> {
  const raw = await callAI(buildBatchPrompt(slots, topic, existingTitles, lessonText));
  const list = Array.isArray(raw.scenarios) ? raw.scenarios : [];

  if (list.length === 0) {
    throw new Error('AI returned no scenarios');
  }

  return list.slice(0, slots.length).map((item, i) => {
    const slot = slots[i];
    const scenario = sanitizeScenario(
      item && typeof item === 'object' ? (item as Record<string, unknown>) : {},
    );
    return {
      ...scenario,
      // The plan is what the faculty asked for, so it wins over whatever the model labelled it.
      category: slot.category,
      difficulty: slot.difficulty,
      patient_id: slot.patient?.id ?? null,
    };
  });
}

export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return unauthorizedResponse();
  if (!['faculty', 'admin'].includes(session.role)) return forbiddenResponse();

  let body: {
    count?: unknown;
    categories?: unknown;
    difficulty?: unknown;
    topic?: unknown;
    avoid_titles?: unknown;
    lesson_text?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const requestedCount = typeof body.count === 'number' ? Math.floor(body.count) : 6;
  if (!Number.isFinite(requestedCount) || requestedCount < 1) {
    return NextResponse.json({ error: 'Count must be at least 1' }, { status: 400 });
  }
  const count = Math.min(requestedCount, MAX_BATCH);

  const difficulty = isValidDifficulty(body.difficulty) ? body.difficulty : null;
  const topic = typeof body.topic === 'string' ? body.topic.trim().slice(0, 500) : '';
  const lessonText =
    typeof body.lesson_text === 'string' ? body.lesson_text.trim().slice(0, MAX_LESSON_CHARS) : '';

  try {
    const supabase = getSupabaseAdmin();

    const allCategories = await listCategories(supabase);
    // Unknown names are dropped; known ones take their stored spelling.
    const categories = Array.isArray(body.categories)
      ? Array.from(
          new Set(
            body.categories
              .filter((c): c is string => typeof c === 'string')
              .map((c) => matchCategory(allCategories, c.trim()))
              .filter((c): c is string => c !== null),
          ),
        )
      : [];

    // Every scenario in the library is grounded on a real patient record — a
    // slot reuses one (planSlots cycles i % patients.length) rather than going
    // ungrounded when the roster is smaller than the batch.
    const { data: patientRows } = await supabase
      .from('patients')
      .select(PATIENT_CONTEXT_COLUMNS)
      .limit(100);
    const patients = shuffle((patientRows ?? []) as unknown as PatientContext[]).slice(0, count);
    if (patients.length === 0) {
      return NextResponse.json(
        { error: 'No patients available. Add patients to the roster before generating scenarios.' },
        { status: 400 },
      );
    }

    const { data: existing } = await supabase
      .from('scenarios')
      .select('title')
      .order('created_at', { ascending: false })
      .limit(40);
    // Caller-supplied titles let a client generating a large library in several
    // sub-batches feed each batch's titles into the next, so they don't repeat.
    const avoidTitles = Array.isArray(body.avoid_titles)
      ? (body.avoid_titles as unknown[]).filter(
          (t): t is string => typeof t === 'string' && t.trim().length > 0,
        )
      : [];
    const existingTitles = [
      ...(existing ?? []).map((s) => (s as { title: string }).title).filter(Boolean),
      ...avoidTitles,
    ];

    const slots = planSlots(count, categories, allCategories, difficulty, patients);

    const scenarios: (SanitizedScenario & { patient_id: string | null })[] = [];
    const failures: string[] = [];

    // Sequential rather than parallel: the free AI tiers rate-limit bursts hard.
    for (let i = 0; i < slots.length; i += CHUNK_SIZE) {
      const chunk = slots.slice(i, i + CHUNK_SIZE);
      try {
        const generated = await generateChunk(
          chunk,
          topic,
          [...existingTitles, ...scenarios.map((s) => s.title)],
          lessonText,
        );
        scenarios.push(...generated);
      } catch (err) {
        console.error(`Batch chunk starting at ${i} failed`, err);
        failures.push(err instanceof Error ? err.message : 'Unknown error');
      }
    }

    if (scenarios.length === 0) {
      const { error, status } = aiErrorResponse(
        new Error(failures.join('; ') || 'No scenarios generated'),
        'scenarios',
      );
      return NextResponse.json({ error }, { status });
    }

    return NextResponse.json({
      scenarios,
      ...(failures.length > 0
        ? {
            warning: `Generated ${scenarios.length} of ${count} scenarios — the AI service failed partway through.`,
          }
        : {}),
    });
  } catch (err) {
    console.error('Batch scenario generation failed', err);
    const { error, status } = aiErrorResponse(err, 'scenarios');
    return NextResponse.json({ error }, { status });
  }
}
