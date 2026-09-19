import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { callAI } from '@/app/lib/ai/generate';
import { readLessonUpload } from '@/app/lib/ai/lesson';
import {
  listCategories,
  matchCategory,
  normalizeCategoryName,
} from '@/app/lib/scenario-categories';

// Parsing the file and a topic pass over up to 15k characters of it can
// outrun the default budget.
export const maxDuration = 60;

const MAX_TOPICS = 5;
/** Tighter than the table's 60: a category is a heading, not a sentence. */
const MAX_NEW_NAME_LENGTH = 40;

interface LessonTopic {
  /** What the lesson covers under this topic, in a sentence. */
  topic: string;
  /** An existing category's stored spelling, or a proposed new name. */
  category: string;
  is_new: boolean;
}

function buildTopicsPrompt(lessonText: string, categories: string[]): string {
  const offered = categories.filter((c) => c !== 'General');
  return `You are a nursing curriculum designer sorting teaching material into simulation-scenario categories.

Existing categories: ${offered.map((c) => `"${c}"`).join(', ')}

Read the lesson below and list the clinical topics it teaches — at most ${MAX_TOPICS}, most central first. Each topic becomes a category that several different simulation scenarios could sit under, so name it at the level of a textbook chapter or body system (for example "Thermoregulation", "Wound Care", "Medication Administration"), never a single procedure or skill (not "Applying a Cooling Blanket").

Only list a topic the lesson substantially teaches. Routine steps every procedure includes — identifying the patient, hand hygiene, consent, safety checks, documentation, taking vital signs while monitoring — are not topics of their own. A lesson on one skill usually has one topic, two at most; list more only when the lesson really covers several distinct areas.

For each topic, reuse an existing category when it genuinely covers the topic, using its exact name. Otherwise propose a new category name in Title Case, 1-4 words, at most ${MAX_NEW_NAME_LENGTH} characters. Never use "General". Merge topics that would land in the same category.

Lesson:
"""
${lessonText}
"""

Return ONLY a valid JSON object with this exact structure (no markdown, no explanations):

{
  "topics": [
    { "topic": "a phrase of at most 15 words on what the lesson covers here, not starting with 'This lesson' or 'The lesson'", "category": "category name" }
  ]
}`;
}

/**
 * Whether a topic's category is new is decided here against the stored list,
 * never taken from the model; so is the spelling of an existing one.
 */
function sanitizeTopics(input: Record<string, unknown>, categories: string[]): LessonTopic[] {
  const raw = Array.isArray(input.topics) ? input.topics : [];
  const seen = new Set<string>();
  const topics: LessonTopic[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Record<string, unknown>;
    const name = normalizeCategoryName(
      typeof t.category === 'string' ? t.category.replace(/^["']+|["']+$/g, '') : '',
    );
    if (!name || name.toLowerCase() === 'general') continue;

    const existing = matchCategory(categories, name);
    const category = existing ?? name.slice(0, MAX_NEW_NAME_LENGTH).trim();
    const key = category.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    topics.push({
      topic: typeof t.topic === 'string' ? t.topic.trim() : '',
      category,
      is_new: existing === null,
    });
    if (topics.length === MAX_TOPICS) break;
  }
  return topics;
}

/**
 * Reads an uploaded lesson and proposes the scenario categories it covers.
 * Nothing is created here — the faculty member picks which topics to keep,
 * and those go through POST /api/faculty/scenarios/categories.
 *
 * The extracted text comes back too, so generating from the lesson afterwards
 * doesn't upload and parse the file again. A failed topic pass still returns
 * the text: the lesson stays usable for generation, just without suggestions.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: 'A lesson file is required' }, { status: 400 });
  }

  const lesson = await readLessonUpload(file);
  if ('error' in lesson) {
    return NextResponse.json({ error: lesson.error }, { status: lesson.status });
  }

  const categories = await listCategories(getSupabaseAdmin());

  try {
    const generated = await callAI(buildTopicsPrompt(lesson.text, categories));
    const topics = sanitizeTopics(generated, categories);
    return NextResponse.json({
      lesson_text: lesson.text,
      topics,
      ...(topics.length === 0
        ? { warning: "Couldn't pick out topics from this lesson — you can still generate from it." }
        : {}),
    });
  } catch (err) {
    console.error('Lesson topic detection failed', err);
    return NextResponse.json({
      lesson_text: lesson.text,
      topics: [],
      warning: "Couldn't detect topics right now — you can still generate from the lesson.",
    });
  }
}
