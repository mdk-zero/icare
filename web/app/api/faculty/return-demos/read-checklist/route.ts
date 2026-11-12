import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { CHECKLIST_LIMITS } from '@/app/lib/checklist-import';
import { checklistFileKind, readChecklistFile } from '@/app/lib/checklist-import-server';

/**
 * POST multipart { file }: read a skills checklist (PDF or Excel) into rows
 * for the instructor to check and edit. Nothing is saved; the rows come back
 * with the Return Demonstration when it is created or saved.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const value = form.get('file');
    file = value instanceof File ? value : null;
  } catch {
    return NextResponse.json({ error: 'Choose a PDF or Excel file to upload.' }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: 'Choose a PDF or Excel file to upload.' }, { status: 400 });
  if (file.size > CHECKLIST_LIMITS.fileBytes) {
    return NextResponse.json({ error: 'That file is over 10 MB. Upload a smaller one.' }, { status: 413 });
  }
  const kind = checklistFileKind(file.name, file.type);
  if (!kind) {
    return NextResponse.json(
      { error: 'Upload the checklist as a PDF or an Excel (.xlsx) file. An older .xls can be saved as .xlsx from Excel.' },
      { status: 415 },
    );
  }

  try {
    const read = await readChecklistFile(new Uint8Array(await file.arrayBuffer()), kind);
    return NextResponse.json({ checklist: read });
  } catch (err) {
    console.error('Read checklist failed', err);
    return NextResponse.json(
      { error: `That ${kind === 'pdf' ? 'PDF' : 'Excel file'} couldn't be read. Check it opens, or type the steps in instead.` },
      { status: 422 },
    );
  }
}
