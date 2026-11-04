import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { badRequest, readJson } from '@/app/lib/courses';
import { CURRICULUM_LIMITS } from '@/app/lib/curriculum';
import { CURRICULUM_BUCKET, CURRICULUM_NEEDS_MIGRATION, curriculumAccess } from '@/app/lib/curriculum-server';

/**
 * POST { fileName, size }: a one-time URL the browser uploads a curriculum PDF
 * to, straight into Storage. A request body through the API is capped at a few
 * megabytes, and a scanned curriculum is often bigger. The path sits in the
 * curriculum owner's folder, which the import route checks.
 */
export async function POST(request: NextRequest) {
  const { supabase, ownerId, response } = await curriculumAccess();
  if (response) return response;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const fileName = typeof body.fileName === 'string' ? body.fileName : '';
  const size = Number(body.size);
  if (!fileName.toLowerCase().endsWith('.pdf')) return badRequest('Upload the curriculum as a PDF');
  if (!Number.isFinite(size) || size <= 0) return badRequest('That file is empty');
  if (size > CURRICULUM_LIMITS.fileBytes) {
    return badRequest(`PDFs can be at most ${CURRICULUM_LIMITS.fileBytes / (1024 * 1024)} MB`);
  }

  const safeName = fileName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(-80);
  const path = `${ownerId}/${randomUUID()}-${safeName}`;
  const { data, error } = await supabase.storage.from(CURRICULUM_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('Failed to create a curriculum upload URL', error);
    const missing = /bucket not found/i.test(error?.message ?? '');
    return NextResponse.json(
      { error: missing ? CURRICULUM_NEEDS_MIGRATION : 'Unable to start the upload' },
      { status: missing ? 503 : 500 },
    );
  }
  return NextResponse.json({ path, uploadUrl: data.signedUrl });
}
