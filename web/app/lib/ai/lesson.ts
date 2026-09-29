import { ACTIVE_CHAPTERS } from '@/scripts/taylors-chapters';

/** Lesson text past this is dropped, keeping the prompt inside the models' input budget. */
export const MAX_LESSON_CHARS = 15_000;
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];

/** Pages read per step of a PDF, so a long book can report progress as it goes. */
const PDF_PAGES_PER_STEP = 25;

/** Share of the file read so far, 0 to 1. */
export type ReadProgress = (fraction: number) => void;

/** Pulls plain text out of a lesson upload — PDF and DOCX go through their
 * respective parsers, everything else (.txt, .md) is read as-is. The parsers
 * load on first use, so importing MAX_LESSON_CHARS doesn't pull in pdf.js. */
async function extractLessonText(file: File, onProgress?: ReadProgress): Promise<string> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith('.pdf')) {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    try {
      const { total } = await parser.getInfo();
      const parts: string[] = [];
      for (let first = 1; first <= total; first += PDF_PAGES_PER_STEP) {
        const last = Math.min(total, first + PDF_PAGES_PER_STEP - 1);
        parts.push((await parser.getText({ first, last })).text);
        if (onProgress) {
          onProgress(last / total);
          // pdf.js parses without yielding to I/O; without this pause a
          // streamed response holds every progress event until the end.
          await new Promise((resolve) => setImmediate(resolve));
        }
      }
      return parts.join('\n');
    } finally {
      await parser.destroy();
    }
  }
  if (name.endsWith('.docx')) {
    const { default: mammoth } = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  return buffer.toString('utf-8');
}

/**
 * Validates an uploaded lesson and returns its text, trimmed to
 * MAX_LESSON_CHARS. A rejection carries the message and status the route
 * should answer with, so every lesson-driven generator fails the same way.
 */
export async function readLessonUpload(
  file: File,
  onProgress?: ReadProgress,
): Promise<
  | { text: string; taylors: TaylorsLesson | null }
  | { error: string; status: number }
> {
  if (file.size > MAX_FILE_BYTES) {
    return { error: 'Lesson file is too large (max 15MB)', status: 400 };
  }

  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.doc')) {
    return {
      error: 'Legacy .doc files are not supported — please save as .docx, PDF, or plain text',
      status: 400,
    };
  }
  if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
    return {
      error: 'Unsupported file type — use a PDF, Word (.docx), or plain text file',
      status: 400,
    };
  }

  let text: string;
  try {
    text = (await extractLessonText(file, onProgress)).trim();
  } catch (err) {
    console.error('Failed to extract lesson text', err);
    return {
      error: "Could not read that file — check it isn't corrupted or password-protected",
      status: 400,
    };
  }

  if (text.length < 50) {
    return { error: 'Could not find enough readable text in that file', status: 400 };
  }
  const taylors = taylorsSections(text);
  return {
    text: taylors?.text ?? text.slice(0, MAX_LESSON_CHARS),
    taylors: taylors && { chapters: taylors.chapters, others: taylors.others, sections: taylors.sections },
  };
}

/** A skill's heading line in Taylor's checklists, e.g. "SKILL 14-1". */
const SKILL_HEADING = /^[ \t]*SKILL[ \t]+(\d{1,2})-(\d{1,2})[ \t]*$/gm;

export interface TaylorsLesson {
  /** Taught chapters (ACTIVE_CHAPTERS) the file has skills from. */
  chapters: number[];
  /** Its other chapters. */
  others: number[];
  /** Each chapter's own skills, up to MAX_LESSON_CHARS, for generating from just that chapter. */
  sections: Record<number, string>;
}

/**
 * The Taylor's chapters a lesson holds skills from, read off its "SKILL x-y"
 * headings across the whole file, not just the part that fits a prompt. Null
 * when the file has no such headings (not a Taylor's lesson).
 *
 * `chapters` are the ones the app teaches (ACTIVE_CHAPTERS), `others` the
 * rest. A file too long for the prompt, such as the whole book, keeps the
 * taught chapters' skills, shared evenly, instead of its first pages (the
 * table of contents).
 */
function taylorsSections(
  full: string,
): (TaylorsLesson & { text: string | null }) | null {
  const headings = [...full.matchAll(SKILL_HEADING)];
  if (headings.length === 0) return null;

  const byChapter = new Map<number, string[]>();
  headings.forEach((h, i) => {
    const chapter = Number(h[1]);
    const end = headings[i + 1]?.index ?? full.length;
    const parts = byChapter.get(chapter) ?? [];
    parts.push(full.slice(h.index, end));
    byChapter.set(chapter, parts);
  });

  const present = [...byChapter.keys()].sort((a, b) => a - b);
  const chapters = present.filter((c) => ACTIVE_CHAPTERS.includes(c));
  const others = present.filter((c) => !ACTIVE_CHAPTERS.includes(c));

  let text: string | null = null;
  if (full.length > MAX_LESSON_CHARS && chapters.length > 0) {
    const share = Math.floor(MAX_LESSON_CHARS / chapters.length);
    text = chapters.map((c) => byChapter.get(c)!.join('').slice(0, share).trim()).join('\n\n');
  }
  const sections = Object.fromEntries(
    present.map((c) => [c, byChapter.get(c)!.join('').slice(0, MAX_LESSON_CHARS).trim()]),
  );
  return { chapters, others, sections, text };
}
