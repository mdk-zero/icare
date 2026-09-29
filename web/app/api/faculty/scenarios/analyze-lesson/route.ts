import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { callAI } from '@/app/lib/ai/generate';
import { readLessonUpload } from '@/app/lib/ai/lesson';
import { ACTIVE_CHAPTERS, TAYLORS_CHAPTERS, type TaylorsChapter } from '@/scripts/taylors-chapters';

// Parsing the file and a topic pass over up to 15k characters of it can
// outrun the default budget.
export const maxDuration = 60;

const MAX_OTHER_TOPICS = 5;

const TAUGHT = TAYLORS_CHAPTERS.filter((c) => ACTIVE_CHAPTERS.includes(c.chapter));

interface LessonTopic {
  /** What the lesson covers under this chapter, in a sentence. */
  topic: string;
  /** The Taylor's chapter this topic is. */
  chapter: number;
  /** The chapter's name. */
  category: string;
}

/** "body temperature, … and brachial blood pressure." from a chapter's description. */
function chapterSummary(chapter: TaylorsChapter): string {
  const body = chapter.description.replace(/^[^:]*:\s*/, '');
  return body.charAt(0).toUpperCase() + body.slice(1);
}

function buildChaptersPrompt(lessonText: string): string {
  return `You are a nursing curriculum designer matching teaching material to the chapters of Taylor's Clinical Nursing Skills that this course teaches.

The course teaches only these chapters:
${TAUGHT.map((c) => `- Chapter ${c.chapter}, ${c.name}: ${chapterSummary(c)}`).join('\n')}

Read the lesson below. List each of those chapters the lesson substantially teaches, most central first. Routine steps every procedure includes (identifying the patient, hand hygiene, consent, documentation, taking vital signs while monitoring) do not make a lesson about that chapter.

Also list up to ${MAX_OTHER_TOPICS} other clinical topics the lesson mainly teaches that none of those chapters covers, each named in Title Case, 1-4 words, at the level of a textbook chapter (for example "Wound Care", "Medications").

Lesson:
"""
${lessonText}
"""

Return ONLY a valid JSON object with this exact structure (no markdown, no explanations):

{
  "chapters": [
    { "chapter": ${TAUGHT[0].chapter}, "topic": "a phrase of at most 15 words on what the lesson covers here, not starting with 'This lesson' or 'The lesson'" }
  ],
  "other_topics": ["Topic Name"]
}`;
}

/**
 * Chapters the app doesn't teach, for the "also in this lesson" note: by name
 * when there are a few, as number ranges ("Chapters 2–13, 16–18") for a book.
 */
function describeChapters(numbers: number[]): string[] {
  if (numbers.length <= 3) {
    return numbers.map((n) => TAYLORS_CHAPTERS.find((c) => c.chapter === n)?.name ?? `Chapter ${n}`);
  }
  const ranges: string[] = [];
  for (let i = 0; i < numbers.length; ) {
    let j = i;
    while (j + 1 < numbers.length && numbers[j + 1] === numbers[j] + 1) j++;
    ranges.push(i === j ? `${numbers[i]}` : `${numbers[i]}–${numbers[j]}`);
    i = j + 1;
  }
  return [`Chapters ${ranges.join(', ')}`];
}

function toTopic(chapter: TaylorsChapter, topic: string): LessonTopic {
  return {
    topic: topic || chapterSummary(chapter),
    chapter: chapter.chapter,
    category: chapter.name,
  };
}

/** Taught chapters from the model's answer; anything else it named is ignored. */
function sanitizeChapters(input: Record<string, unknown>): LessonTopic[] {
  const raw = Array.isArray(input.chapters) ? input.chapters : [];
  const topics: LessonTopic[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Record<string, unknown>;
    const chapter = TAUGHT.find((c) => c.chapter === Number(t.chapter));
    if (!chapter || topics.some((x) => x.chapter === chapter.chapter)) continue;
    topics.push(toTopic(chapter, typeof t.topic === 'string' ? t.topic.trim() : ''));
  }
  return topics;
}

function sanitizeOtherTopics(input: Record<string, unknown>): string[] {
  const raw = Array.isArray(input.other_topics) ? input.other_topics : [];
  const names = raw
    .filter((x): x is string => typeof x === 'string')
    .map((x) => x.trim().replace(/^["']+|["']+$/g, '').slice(0, 40))
    .filter(Boolean);
  return [...new Set(names)].slice(0, MAX_OTHER_TOPICS);
}

/**
 * Reads an uploaded lesson and finds which of the taught Taylor's chapters it
 * covers. Nothing is created here — the faculty member picks which to keep.
 *
 * A Taylor's lesson names its skills ("SKILL 14-1"), so its chapters are read
 * off those headings with no AI call. Anything else goes to the model, which
 * can only answer with taught chapters; what it finds outside them comes back
 * as `not_taught`, so the page can say why those topics aren't offered.
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

  const taughtNames = TAUGHT.map((c) => c.name).join(', ');

  if (lesson.taylors) {
    const topics = lesson.taylors.chapters.map((n) =>
      toTopic(TAUGHT.find((c) => c.chapter === n)!, ''),
    );
    const notTaught = describeChapters(lesson.taylors.others);
    return NextResponse.json({
      lesson_text: lesson.text,
      topics,
      not_taught: notTaught,
      ...(topics.length === 0
        ? { warning: `None of this lesson's chapters are taught here (only ${taughtNames}). You can still generate from it.` }
        : {}),
    });
  }

  try {
    const generated = await callAI(buildChaptersPrompt(lesson.text));
    const topics = sanitizeChapters(generated);
    return NextResponse.json({
      lesson_text: lesson.text,
      topics,
      not_taught: sanitizeOtherTopics(generated),
      ...(topics.length === 0
        ? { warning: `This lesson doesn't match a taught chapter (${taughtNames}). You can still generate from it.` }
        : {}),
    });
  } catch (err) {
    console.error('Lesson topic detection failed', err);
    return NextResponse.json({
      lesson_text: lesson.text,
      topics: [],
      not_taught: [],
      warning: "Couldn't detect topics right now — you can still generate from the lesson.",
    });
  }
}
