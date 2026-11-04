import { NextRequest } from 'next/server';
import { logAudit } from '@/app/lib/audit';
import { analyzeCurriculumPdf, type PdfStage } from '@/app/lib/ai/curriculum';
import { badRequest, isMissingCourseSchema, readJson } from '@/app/lib/courses';
import { CURRICULUM_LIMITS } from '@/app/lib/curriculum';
import {
  CURRICULUM_BUCKET,
  CURRICULUM_NEEDS_MIGRATION,
  curriculumAccess,
  removeCurriculumFile,
  saveImportedCurriculum,
} from '@/app/lib/curriculum-server';
import { NDJSON } from '@/app/lib/ndjson';

// A long curriculum is one big AI answer. analyzeCurriculumPdf keeps its own
// wait inside this, so a slow reading ends in a message rather than a dead stream.
export const maxDuration = 60;

type Event =
  | { type: 'progress'; stage: PdfStage | 'saving' }
  | { type: 'result'; curriculum_id: string; name: string; course_count: number }
  | { type: 'error'; error: string };

/**
 * POST { path, file_name } for a PDF already uploaded through upload-url: reads
 * it with AI and saves what it finds as a new curriculum that isn't in use, for
 * the Dean or Program Chair to check before using it. Nothing in use changes.
 *
 * The answer streams as NDJSON: a progress event per stage, then one result or
 * error. A file that doesn't become a curriculum is removed from Storage.
 */
export async function POST(request: NextRequest) {
  const { session, supabase, ownerId, response } = await curriculumAccess();
  if (response) return response;

  const body = await readJson(request);
  if (!body) return badRequest('Invalid JSON body');
  const path = typeof body.path === 'string' ? body.path : '';
  const fileName = typeof body.file_name === 'string' ? body.file_name.slice(0, 200) : 'curriculum.pdf';
  if (!path.startsWith(`${ownerId}/`) || path.includes('..')) return badRequest('That upload is not yours');

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: Event) => {
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        } catch {
          // The person left the page. The work carries on and is there when they return.
        }
      };
      try {
        const { data: file, error } = await supabase.storage.from(CURRICULUM_BUCKET).download(path);
        if (error || !file) throw error ?? new Error('The upload is missing');
        if (file.size > CURRICULUM_LIMITS.fileBytes) {
          await removeCurriculumFile(supabase, path);
          send({ type: 'error', error: `PDFs can be at most ${CURRICULUM_LIMITS.fileBytes / (1024 * 1024)} MB` });
          return;
        }

        const outcome = await analyzeCurriculumPdf(new Uint8Array(await file.arrayBuffer()), fileName, (stage) =>
          send({ type: 'progress', stage }),
        );
        if ('error' in outcome) {
          await removeCurriculumFile(supabase, path);
          send({ type: 'error', error: outcome.error });
          return;
        }

        send({ type: 'progress', stage: 'saving' });
        const { name, courses, analysis } = outcome.curriculum;
        const curriculumId = await saveImportedCurriculum(supabase, {
          ownerId,
          createdBy: session.uid,
          name,
          sourceName: fileName,
          sourcePath: path,
          analysis,
          courses,
        });

        await logAudit(
          session,
          {
            action: 'curriculum.import',
            entityType: 'curricula',
            entityId: curriculumId,
            details: { name, file: fileName, courses: courses.length },
          },
          request,
        );
        send({ type: 'result', curriculum_id: curriculumId, name, course_count: courses.length });
      } catch (err) {
        console.error('Curriculum import failed', err);
        await removeCurriculumFile(supabase, path);
        send({
          type: 'error',
          error: isMissingCourseSchema(err) ? CURRICULUM_NEEDS_MIGRATION : 'Could not read that curriculum. Please try again.',
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    // no-transform keeps a compressing proxy from buffering the stream.
    headers: {
      'Content-Type': `${NDJSON}; charset=utf-8`,
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
}
