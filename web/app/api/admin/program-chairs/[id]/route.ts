import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { requireDean } from '@/app/lib/auth/dean';
import { updateUser } from '@/app/lib/auth/session';
import { parseSex } from '@/app/lib/auth/user';
import { logAudit } from '@/app/lib/audit';
import { findProgramChair, ownsRecords, peopleOf, PROGRAM_CHAIR_COLUMNS } from '@/app/lib/program-chairs';

interface RouteParams {
  params: Promise<{ id: string }>;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? '' : 's'}`;
}

/**
 * Edits one of the Dean's Program Chairs: their name and gender (users.sex).
 * Their email changes through /api/users/:id/email.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const guard = await requireDean();
  if (guard.response) return guard.response;
  const { session } = guard;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 });
    }
    updates.name = body.name.trim();
  }
  const parsedSex = parseSex(body.sex);
  if (parsedSex.error) return NextResponse.json({ error: parsedSex.error }, { status: 400 });
  // Absent leaves the recorded value alone; an explicit empty clears it.
  if (parsedSex.sex !== undefined) updates.sex = parsedSex.sex;
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    if (!(await findProgramChair(supabase, session.uid, id))) {
      return NextResponse.json({ error: 'Program Chair not found' }, { status: 404 });
    }

    const { data: user, error } = await updateUser(id, updates, { revoke: false, columns: PROGRAM_CHAIR_COLUMNS });
    if (error || !user) {
      console.error('Failed to update a Program Chair', error);
      return NextResponse.json({ error: 'Unable to update the Program Chair' }, { status: 500 });
    }

    await logAudit(
      session,
      { action: 'user.update', entityType: 'users', entityId: id, details: { ...updates, by: 'dean' } },
      request,
    );
    return NextResponse.json({ user: { ...user, ...(await peopleOf(supabase, id)) } });
  } catch (err) {
    console.error('Update Program Chair failed', err);
    return NextResponse.json({ error: 'Unable to update the Program Chair' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const guard = await requireDean();
  if (guard.response) return guard.response;
  const { session } = guard;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const chair = await findProgramChair(supabase, session.uid, id);
    if (!chair) return NextResponse.json({ error: 'Program Chair not found' }, { status: 404 });

    // Their people and records would be left with no owner. The Dean can't see
    // them to move them, so this one goes through an Admin.
    const { instructor_count, student_count } = await peopleOf(supabase, id);
    const hasRecords = await ownsRecords(supabase, id);
    if (instructor_count || student_count || hasRecords) {
      const held = [
        instructor_count ? plural(instructor_count, 'instructor') : null,
        student_count ? plural(student_count, 'student') : null,
        hasRecords ? 'other records' : null,
      ].filter(Boolean);
      const list = held.length > 1 ? `${held.slice(0, -1).join(', ')} and ${held.at(-1)}` : held[0];
      return NextResponse.json(
        { error: `${chair.name} still has ${list}. Ask an Admin to move them before deleting this account.` },
        { status: 409 },
      );
    }

    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete a Program Chair', error);
      // 23503: rows elsewhere still point at this account without a cascade.
      const message =
        error.code === '23503' ? 'This account still has records that block deletion' : 'Unable to delete this account';
      return NextResponse.json({ error: message }, { status: error.code === '23503' ? 409 : 500 });
    }

    await logAudit(
      session,
      {
        action: 'user.delete',
        entityType: 'users',
        entityId: id,
        details: { email: chair.email, role: 'admin', admin_title: 'program_chair', by: 'dean' },
      },
      request,
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete Program Chair failed', err);
    return NextResponse.json({ error: 'Unable to delete this account' }, { status: 500 });
  }
}
