import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { fileKindOf, LIBRARY_BUCKET, MAX_FILE_BYTES } from '@/app/lib/library';

/**
 * POST { fileName, mime, size }: a one-time URL the browser uploads a PDF or
 * PowerPoint file to, straight into Storage. Files go around the API because
 * a request body through it is capped at a few megabytes, and decks are often
 * bigger. The path is in the caller's own folder; saving the material checks
 * that it still is.
 */
export async function POST(request: NextRequest) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  let body: { fileName?: unknown; mime?: unknown; size?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const fileName = typeof body.fileName === 'string' ? body.fileName : '';
  const mime = typeof body.mime === 'string' ? body.mime : '';
  const size = Number(body.size);
  const kind = fileKindOf(mime, fileName);
  if (!kind) return NextResponse.json({ error: 'Upload a PDF or a PowerPoint file (.pptx, .ppt, .ppsx)' }, { status: 400 });
  if (!Number.isFinite(size) || size <= 0) return NextResponse.json({ error: 'The file is empty' }, { status: 400 });
  if (size > MAX_FILE_BYTES) return NextResponse.json({ error: 'Files can be at most 50 MB' }, { status: 400 });

  const safeName = fileName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80) || 'file';
  const path = `${session.uid}/${randomUUID()}-${safeName}`;
  const { data, error } = await getSupabaseAdmin().storage.from(LIBRARY_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('Failed to create a library upload URL', error);
    const missing = /bucket not found/i.test(error?.message ?? '');
    return NextResponse.json(
      { error: missing ? 'File uploads need database migration 061.' : 'Unable to start the upload' },
      { status: missing ? 503 : 500 },
    );
  }
  return NextResponse.json({ kind, path, uploadUrl: data.signedUrl, token: data.token });
}
