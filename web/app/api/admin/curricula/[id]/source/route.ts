import { NextRequest, NextResponse } from 'next/server';
import { notFound } from '@/app/lib/courses';
import {
  CURRICULUM_BUCKET,
  curriculumAccess,
  curriculumFailure,
  ownCurriculum,
} from '@/app/lib/curriculum-server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const LINK_SECONDS = 600;

/** GET: a short-lived link to the PDF a curriculum was read from, to check the reading against. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { supabase, ownerId, response } = await curriculumAccess();
  if (response) return response;
  const { id } = await params;

  try {
    const row = await ownCurriculum(supabase, ownerId, id);
    if (!row?.source_path) return notFound('PDF');
    const { data, error } = await supabase.storage.from(CURRICULUM_BUCKET).createSignedUrl(row.source_path, LINK_SECONDS);
    if (error || !data) throw error ?? new Error('No signed URL');
    return NextResponse.json({ url: data.signedUrl });
  } catch (err) {
    return curriculumFailure(err, 'Unable to open the PDF');
  }
}
