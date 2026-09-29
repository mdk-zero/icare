import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { callAI } from '@/app/lib/ai/generate';
import { readLessonUpload } from '@/app/lib/ai/lesson';
import { ACTIVE_CHAPTERS, TAYLORS_CHAPTERS, type TaylorsChapter } from '@/scripts/taylors-chapters';

// Parsing the file (a whole book reads in page steps) and a topic pass over
// up to 15k characters of it can outrun the default budget.
export const maxDuration = 60;

const MAX_NEW_TOPICS = 5;
/** A topic is a heading, not a sentence. */
const MAX_NAME_LENGTH = 40;

const TAUGHT = TAYLORS_CHAPTERS.filter((c) => ACTIVE_CHAPTERS.includes(c.chapter));

/** The core chapters first, then the rest of the book in order. */
const BOOK_ORDER = [...TAUGHT, ...TAYLORS_CHAPTERS.filter((c) => !ACTIVE_CHAPTERS.includes(c.chapter))];

interface LessonTopic {
  /** What the lesson covers under this topic, in a sentence. */
  topic: string;
  /** The Taylor's chapter, or null for a new topic the book doesn't cover. */
  chapter: number | null;
  /** The chapter's name, or the new topic's. */
  category: string;
}

/** "body temperature, … and brachial blood pressure." from a chapter's description. */
function chapterSummary(chapter: TaylorsChapter): string {
  const body = chapter.description.replace(/^[^:]*:\s*/, '');
  return body.charAt(0).toUpperCase() + body.slice(1);
}

function buildTopicsPrompt(lessonText: string): string {
  return `You are a nursing curriculum designer sorting teaching material. The course's standard is Taylor's Clinical Nursing Skills, whose chapters are:
${BOOK_ORDER.map((c) => `- Chapter ${c.chapter}, ${c.name}: ${chapterSummary(c)}`).join('\n')}

Read the lesson below and list the clinical topics it substantially teaches, most central first:
- Under "chapters", each of those chapters the lesson teaches.
- Under "new_topics", up to ${MAX_NEW_TOPICS} other topics it teaches that no chapter covers, named in Title Case, 1-4 words, at the level of a textbook chapter or body system (for example "Wound Care", "Medications"), never a single procedure.

Routine steps every procedure includes (identifying the patient, hand hygiene, consent, documentation, taking vital signs while monitoring) are not topics of their own. A lesson on one skill usually has one topic.

Lesson:
"""
${lessonText}
"""

Return ONLY a valid JSON object with this exact structure (no markdown, no explanations):

{
  "chapters": [
    { "chapter": ${TAUGHT[0].chapter}, "topic": "${TOPIC_PHRASE}" }
  ],
  "new_topics": [
    { "name": "Topic Name", "topic": "${TOPIC_PHRASE}" }
  ]
}`;
}

const TOPIC_PHRASE =
  "a phrase of at most 15 words on what the lesson covers here, not starting with 'This lesson' or 'The lesson'";

function chapterTopic(chapter: TaylorsChapter, topic = ''): LessonTopic {
  return { topic: topic || chapterSummary(chapter), chapter: chapter.chapter, category: chapter.name };
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.trim().replace(/^["']+|["']+$/g, '').slice(0, max).trim() : '';
}

/** Taught chapters, then new topics, from the model's answer. */
function sanitizeTopics(input: Record<string, unknown>): LessonTopic[] {
  const topics: LessonTopic[] = [];
  const taken = (name: string) => topics.some((t) => t.category.toLowerCase() === name.toLowerCase());

  for (const item of Array.isArray(input.chapters) ? input.chapters : []) {
    if (!item || typeof item !== 'object') continue;
    const t = item as Record<string, unknown>;
    const chapter = TAYLORS_CHAPTERS.find((c) => c.chapter === Number(t.chapter));
    if (chapter && !taken(chapter.name)) topics.push(chapterTopic(chapter, text(t.topic, 160)));
  }

  let fresh = 0;
  for (const item of Array.isArray(input.new_topics) ? input.new_topics : []) {
    if (!item || typeof item !== 'object' || fresh === MAX_NEW_TOPICS) continue;
    const t = item as Record<string, unknown>;
    const name = text(t.name, MAX_NAME_LENGTH);
    // A "new" topic that is really a chapter joins the chapters instead.
    const chapter = TAYLORS_CHAPTERS.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (!name || taken(name) || name.toLowerCase() === 'general') continue;
    if (chapter) {
      topics.push(chapterTopic(chapter, text(t.topic, 160)));
      continue;
    }
    topics.push({ topic: text(t.topic, 160), chapter: null, category: name });
    fresh++;
  }
  return topics;
}

type Event =
  | { type: 'progress'; stage: 'reading' | 'topics'; fraction: number }
  | { type: 'result'; lesson_text: string; topics: LessonTopic[]; sections?: Record<string, string>; warning?: string }
  | { type: 'error'; error: string; status: number };

/**
 * Reads an uploaded lesson and finds its topics. Taylor's is the standard:
 * the chapters it covers come first (the core ones ahead of the rest), and
 * anything it teaches that the book doesn't cover comes back as a new topic
 * (chapter null) the faculty member can still build cases on. Nothing is
 * created here.
 *
 * A Taylor's lesson names its skills ("SKILL 14-1"), so its chapters are read
 * off those headings with no AI call, and `sections` holds each chapter's own
 * text so a whole book can be generated from whichever chapters are ticked.
 * Anything else goes to the model.
 *
 * The answer streams as NDJSON: progress events while the file is read (a PDF
 * page step at a time) and topics are found, then one result or error. The
 * text comes back too, so generating afterwards doesn't upload the file again,
 * and a failed topic pass still returns it.
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

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Event) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        send(await analyze(file, (fraction) => send({ type: 'progress', stage: 'reading', fraction }), () =>
          send({ type: 'progress', stage: 'topics', fraction: 0 }),
        ));
      } catch (err) {
        console.error('Lesson analysis failed', err);
        send({ type: 'error', error: 'Could not read that lesson', status: 500 });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    // no-transform keeps a compressing proxy from buffering the stream.
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}

async function analyze(
  file: File,
  onReading: (fraction: number) => void,
  onTopics: () => void,
): Promise<Event> {
  const lesson = await readLessonUpload(file, onReading);
  if ('error' in lesson) return { type: 'error', error: lesson.error, status: lesson.status };
  onTopics();

  if (lesson.taylors) {
    const { chapters, others, sections } = lesson.taylors;
    const present = new Set([...chapters, ...others]);
    const inBook = BOOK_ORDER.filter((c) => present.has(c.chapter));
    const topics = inBook.map((c) => chapterTopic(c));
    const byName = Object.fromEntries(inBook.map((c) => [c.name, sections[c.chapter]]));
    return { type: 'result', lesson_text: lesson.text, topics, sections: byName };
  }

  try {
    const topics = sanitizeTopics(await callAI(buildTopicsPrompt(lesson.text)));
    return {
      type: 'result',
      lesson_text: lesson.text,
      topics,
      ...(topics.length === 0
        ? { warning: "Couldn't pick out topics from this lesson — you can still generate from it." }
        : {}),
    };
  } catch (err) {
    console.error('Lesson topic detection failed', err);
    return {
      type: 'result',
      lesson_text: lesson.text,
      topics: [],
      warning: "Couldn't detect topics right now — you can still generate from the lesson.",
    };
  }
}
