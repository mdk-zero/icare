import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

/** Lesson text past this is dropped, keeping the prompt inside the models' input budget. */
export const MAX_LESSON_CHARS = 15_000;
const MAX_FILE_BYTES = 15 * 1024 * 1024; // 15MB
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];

/** Pulls plain text out of a lesson upload — PDF and DOCX go through their
 * respective parsers, everything else (.txt, .md) is read as-is. */
async function extractLessonText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  if (name.endsWith('.pdf')) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  if (name.endsWith('.docx')) {
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
): Promise<{ text: string } | { error: string; status: number }> {
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
    text = (await extractLessonText(file)).trim();
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
  return { text: text.slice(0, MAX_LESSON_CHARS) };
}
