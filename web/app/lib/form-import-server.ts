import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from './supabase/server';
import { callAI } from './ai/generate';
import {
  FORM_IMPORT_LIMITS,
  FORM_IMPORT_PROMPT,
  buildFormFromAi,
  findMarks,
  layoutForAi,
  type PageText,
} from './form-import';
import type { FormPageImage, FormSection } from './return-demo-forms';

/**
 * Reading an uploaded PDF form on the server (migration 095): the text on
 * each page with its position (pdf.js), a picture of each page (pdf-parse),
 * the fields an AI names from that layout, and the pictures kept in storage.
 * Nothing here saves the form: the instructor checks it first.
 */

export const FORMS_BUCKET = 'return-demo-forms';
/** Pictures at three times the page's point size: sharp on a phone, ~400 KB a page. */
const PICTURE_SCALE = 3;

export class FormReadError extends Error {}

/** Each page's size, and every run of text on it, placed from the top left. */
export async function readLayout(bytes: Uint8Array): Promise<{ sizes: { width: number; height: number }[]; items: PageText[] }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: true, isEvalSupported: false }).promise;
  try {
    if (doc.numPages > FORM_IMPORT_LIMITS.pages) {
      throw new FormReadError(`Upload a form of ${FORM_IMPORT_LIMITS.pages} pages or fewer. This one has ${doc.numPages}.`);
    }
    const sizes: { width: number; height: number }[] = [];
    const items: PageText[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const { width, height } = page.getViewport({ scale: 1 });
      sizes.push({ width, height });
      const content = await page.getTextContent();
      for (const raw of content.items) {
        if (!('str' in raw) || !raw.str.trim()) continue;
        const [, , , d, e, f] = raw.transform as number[];
        const h = Math.abs(raw.height || d) || 8;
        items.push({ page: n - 1, str: raw.str, x: e, y: height - f - h, w: raw.width, h });
      }
    }
    return { sizes, items };
  } finally {
    await doc.destroy();
  }
}

/** A PNG of each page. */
async function renderPages(bytes: Uint8Array): Promise<Uint8Array[]> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: bytes.slice() });
  try {
    const shot = await parser.getScreenshot({ scale: PICTURE_SCALE, imageBuffer: true, imageDataUrl: false });
    return shot.pages.map((p) => p.data as Uint8Array);
  } finally {
    await parser.destroy();
  }
}

/**
 * Stores the page pictures under the uploader's folder and returns their
 * public URLs. The first upload on a deployment without migration 095
 * creates the bucket.
 */
async function storePictures(uid: string, pictures: Uint8Array[]): Promise<string[]> {
  const storage = getSupabaseAdmin().storage;
  const folder = `${uid}/${randomUUID()}`;
  const urls: string[] = [];
  for (const [n, png] of pictures.entries()) {
    const path = `${folder}/page-${n + 1}.png`;
    const upload = () => storage.from(FORMS_BUCKET).upload(path, png, { contentType: 'image/png', upsert: false });
    let { error } = await upload();
    if (error && /bucket not found/i.test(error.message)) {
      const created = await storage.createBucket(FORMS_BUCKET, { public: true, fileSizeLimit: 5 * 1024 * 1024, allowedMimeTypes: ['image/png'] });
      if (created.error && !/already exists/i.test(created.error.message)) throw created.error;
      ({ error } = await upload());
    }
    if (error) throw error;
    urls.push(storage.from(FORMS_BUCKET).getPublicUrl(path).data.publicUrl);
  }
  return urls;
}

/** Whether a picture URL is one this app stored, in the given uploader's folder. */
export function isOwnPicture(url: string, uid: string): boolean {
  const base = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const prefix = `${base.replace(/\/$/, '')}/storage/v1/object/public/${FORMS_BUCKET}/${uid}/`;
  return url.startsWith(prefix) && !url.slice(prefix.length).includes('..');
}

export interface ReadForm {
  title: string;
  description: string;
  pages: FormPageImage[];
  sections: FormSection[];
  /** No text on the pages (a scan): the fields were read by eye and have no place on the page. */
  scanned: boolean;
}

/**
 * Reads an uploaded PDF form: its pages as pictures, and the fields the AI
 * finds, placed on the boxes and blanks the layout shows. A scanned form
 * (no text) goes to the AI as the file itself; its fields come back without
 * places, for the instructor to check.
 */
export async function readUploadedForm(uid: string, bytes: Uint8Array, fileName: string): Promise<ReadForm> {
  let layout: Awaited<ReturnType<typeof readLayout>>;
  try {
    layout = await readLayout(bytes);
  } catch (err) {
    if (err instanceof FormReadError) throw err;
    throw new FormReadError("That PDF couldn't be opened. Check it opens on your computer, then try again.");
  }
  const urls = await storePictures(uid, await renderPages(bytes));
  const pages = layout.sizes.map((s, n) => ({ image: urls[n], width: s.width, height: s.height }));

  const scanned = layout.items.length === 0;
  const marks = findMarks(layout.items);
  const prompt = scanned
    ? `${FORM_IMPORT_PROMPT}\n\nThis form is a scan with no text layer, attached as a PDF. Read it from the picture. Give no "blank", "cell" or "box".\nFile name: ${fileName}`
    : `${FORM_IMPORT_PROMPT}\n\nFile name: ${fileName}\n\n${layoutForAi(layout.sizes, layout.items, marks)}`;
  const raw = await callAI(prompt, {
    temperature: 0,
    maxTokens: 8000,
    ...(scanned ? { pdf: Buffer.from(bytes).toString('base64') } : {}),
  });
  const built = buildFormFromAi(raw, marks, pages);
  return {
    title: built.title || fileName.replace(/\.pdf$/i, '').slice(0, 200),
    description: built.description,
    pages,
    sections: built.sections,
    scanned,
  };
}
