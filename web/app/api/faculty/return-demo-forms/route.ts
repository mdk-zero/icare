import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { sanitizeCustomForm, FORM_IMPORT_LIMITS } from '@/app/lib/form-import';
import { isOwnPicture } from '@/app/lib/form-import-server';
import {
  CUSTOM_FORM_COLUMNS,
  CUSTOM_FORMS_NEED_MIGRATION,
  customForm,
  isMissingCustomForms,
  listCustomForms,
  type CustomFormRow,
} from '@/app/lib/return-demo-forms-server';
import type { FormPageImage } from '@/app/lib/return-demo-forms';

/**
 * Forms instructors upload for Return Demonstrations (095).
 *
 * GET: the ones this instructor can add (their own; every one for an admin),
 * with `enabled: false` before 095.
 * POST { title, description, pages, sections }: keep a form after the
 * instructor has checked what was read from their PDF (see ./read). The pages
 * must be pictures stored for this instructor; everything else is checked
 * again here, whatever the editor sent.
 */
async function staff() {
  const session = await readSession();
  if (!session) return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!['faculty', 'admin'].includes(session.role)) return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  return { session };
}

export async function GET() {
  const auth = await staff();
  if ('response' in auth) return auth.response;
  try {
    return NextResponse.json(await listCustomForms(getSupabaseAdmin(), auth.session));
  } catch (err) {
    console.error('List uploaded forms failed', err);
    return NextResponse.json({ error: 'Unable to list your forms' }, { status: 500 });
  }
}

function parsePages(value: unknown, uid: string): FormPageImage[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > FORM_IMPORT_LIMITS.pages) return null;
  const pages: FormPageImage[] = [];
  for (const p of value) {
    const { image, width, height } = (p ?? {}) as Record<string, unknown>;
    if (typeof image !== 'string' || !isOwnPicture(image, uid)) return null;
    if (typeof width !== 'number' || typeof height !== 'number' || width < 50 || height < 50 || width > 3000 || height > 3000) return null;
    pages.push({ image, width, height });
  }
  return pages;
}

export async function POST(request: NextRequest) {
  const auth = await staff();
  if ('response' in auth) return auth.response;
  const { session } = auth;

  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const pages = parsePages(body.pages, session.uid);
  if (!pages) return NextResponse.json({ error: 'Upload the form again: its pages are missing.' }, { status: 400 });
  const form = sanitizeCustomForm(body, pages);
  if (!form) return NextResponse.json({ error: 'Give the form a title and at least one field to fill in.' }, { status: 400 });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('return_demo_custom_forms')
      .insert({ created_by: session.uid, title: form.title, description: form.description, pages, sections: form.sections })
      .select(CUSTOM_FORM_COLUMNS)
      .single();
    if (error) {
      if (isMissingCustomForms(error)) return NextResponse.json({ error: CUSTOM_FORMS_NEED_MIGRATION }, { status: 503 });
      throw error;
    }
    await logAudit(
      session,
      {
        action: 'return_demo_form.create',
        entityType: 'return_demo_custom_forms',
        entityId: (data as CustomFormRow).id,
        details: { message: `Added the form “${form.title}”`, fields: form.sections.reduce((n, s) => n + s.fields.length, 0) },
      },
      request,
    );
    return NextResponse.json({ form: customForm(data as CustomFormRow) }, { status: 201 });
  } catch (err) {
    console.error('Save uploaded form failed', err);
    return NextResponse.json({ error: 'Unable to save the form' }, { status: 500 });
  }
}
