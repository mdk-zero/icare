import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { customFormKey } from '@/app/lib/return-demo-forms';
import { isMissingCustomForms } from '@/app/lib/return-demo-forms-server';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * DELETE: remove an uploaded form (095) nobody uses yet. Only its uploader or
 * an admin may; once a Return Demonstration includes it, it stays, so the
 * answers students give on it keep their form.
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!['faculty', 'admin'].includes(session.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const { data: row, error } = await supabase
      .from('return_demo_custom_forms')
      .select('id, created_by, title')
      .eq('id', id)
      .maybeSingle();
    if (error && !isMissingCustomForms(error)) throw error;
    if (!row) return NextResponse.json({ error: 'Form not found' }, { status: 404 });
    if (session.role !== 'admin' && row.created_by !== session.uid) {
      return NextResponse.json({ error: 'Only the instructor who uploaded it can remove it' }, { status: 403 });
    }

    const { count, error: usedError } = await supabase
      .from('scenarios')
      .select('id', { count: 'exact', head: true })
      .contains('form_keys', [customFormKey(id)]);
    if (usedError) throw usedError;
    if ((count ?? 0) > 0) {
      return NextResponse.json(
        { error: `A Return Demonstration uses this form, so it can't be removed. Take it off ${count === 1 ? 'that one' : `those ${count}`} first.` },
        { status: 409 },
      );
    }

    const { error: deleteError } = await supabase.from('return_demo_custom_forms').delete().eq('id', id);
    if (deleteError) throw deleteError;
    await logAudit(
      session,
      { action: 'return_demo_form.delete', entityType: 'return_demo_custom_forms', entityId: id, details: { message: `Removed the form “${row.title}”` } },
      request,
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete uploaded form failed', err);
    return NextResponse.json({ error: 'Unable to remove the form' }, { status: 500 });
  }
}
