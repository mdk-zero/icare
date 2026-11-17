import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { aiErrorResponse } from '@/app/lib/ai/generate';
import { FORM_IMPORT_LIMITS } from '@/app/lib/form-import';
import { FormReadError, readUploadedForm } from '@/app/lib/form-import-server';

// Reading the pages and asking the AI takes a while on a long form.
export const maxDuration = 60;

/**
 * POST multipart { file }: read an uploaded PDF form (095) into pages and
 * fields for the instructor to check. The page pictures are stored; the form
 * itself is kept only when the instructor saves it (POST ..).
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let file: File | null = null;
  try {
    const value = (await request.formData()).get('file');
    file = value instanceof File ? value : null;
  } catch {
    file = null;
  }
  if (!file) return NextResponse.json({ error: 'Choose a PDF form to upload.' }, { status: 400 });
  if (!(file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf')) {
    return NextResponse.json({ error: 'Upload the form as a PDF.' }, { status: 415 });
  }
  if (file.size > FORM_IMPORT_LIMITS.fileBytes) {
    return NextResponse.json({ error: 'That file is over 10 MB. Upload a smaller one.' }, { status: 413 });
  }

  try {
    const form = await readUploadedForm(session.uid, new Uint8Array(await file.arrayBuffer()), file.name);
    return NextResponse.json({ form });
  } catch (err) {
    if (err instanceof FormReadError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error('Read uploaded form failed', err);
    const { error, status } = aiErrorResponse(err, 'the form');
    return NextResponse.json({ error }, { status });
  }
}
