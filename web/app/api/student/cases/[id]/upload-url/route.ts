import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { loadStudentCase, CASES_NOT_READY } from '@/app/lib/cases';
import { CASE_BUCKET, caseFileTypeOf, MAX_CASE_FILE_BYTES } from '@/app/lib/case-rubric';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/student/cases/:id/upload-url { fileName, mime, size }
 * A one-time URL the group leader's app uploads the slides to, straight into
 * Storage (a deck is often bigger than an API request may be). The path is in
 * the group's folder; handing in checks that it still is.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'student') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  let body: { fileName?: unknown; mime?: unknown; size?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const fileName = typeof body.fileName === 'string' ? body.fileName : '';
  const mime = typeof body.mime === 'string' ? body.mime : '';
  const size = Number(body.size);
  const type = caseFileTypeOf(mime, fileName);
  if (!type) return NextResponse.json({ error: 'Upload a PowerPoint (.pptx) or PDF file' }, { status: 400 });
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: 'The file is empty' }, { status: 400 });
  if (size > MAX_CASE_FILE_BYTES) return NextResponse.json({ error: 'Files can be at most 50 MB' }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();
    const loaded = await loadStudentCase(supabase, session.uid, id);
    if (loaded.missing === 'not_ready') return NextResponse.json({ error: CASES_NOT_READY }, { status: 503 });
    if (loaded.missing || !loaded.group) return NextResponse.json({ error: 'Case presentation not found' }, { status: 404 });
    if (loaded.group.leader_id !== session.uid) {
      return NextResponse.json({ error: 'Only your group leader can upload the slides' }, { status: 403 });
    }
    if (loaded.group.status === 'graded') {
      return NextResponse.json({ error: 'Your group has been graded; the slides can no longer change' }, { status: 409 });
    }

    const safeName = fileName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || `slides.${type}`;
    const path = `${loaded.group.id}/${randomUUID()}-${safeName}`;
    const { data, error } = await supabase.storage.from(CASE_BUCKET).createSignedUploadUrl(path);
    if (error || !data) {
      console.error('Failed to create a case upload URL', error);
      const missing = /bucket not found/i.test(error?.message ?? '');
      return NextResponse.json(
        { error: missing ? 'File uploads need database migration 093.' : 'Unable to start the upload' },
        { status: missing ? 503 : 500 },
      );
    }
    return NextResponse.json({ type, path, uploadUrl: data.signedUrl, token: data.token });
  } catch (err) {
    console.error('Failed to start a case upload', err);
    return NextResponse.json({ error: 'Unable to start the upload' }, { status: 500 });
  }
}
