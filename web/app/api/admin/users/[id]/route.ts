import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';

const VALID_ROLES = ['student', 'faculty', 'admin'] as const;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { name, role } = body as { name?: unknown; role?: unknown };
  const updates: Record<string, unknown> = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    }
    updates.name = name.trim();
  }
  if (role !== undefined) {
    if (typeof role !== 'string' || !(VALID_ROLES as readonly string[]).includes(role)) {
      return NextResponse.json({ error: 'Role must be student, faculty, or admin' }, { status: 400 });
    }
    if (id === session.uid && role !== 'admin') {
      return NextResponse.json({ error: 'You cannot demote your own account' }, { status: 400 });
    }
    updates.role = role;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: user, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, email, name, role, picture_url, created_at, last_login_at')
      .maybeSingle();

    if (error) {
      console.error('Failed to update user', error);
      return NextResponse.json({ error: 'Unable to update user' }, { status: 500 });
    }
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    await logAudit(
      session,
      { action: 'user.update', entityType: 'users', entityId: id, details: updates },
      request,
    );

    return NextResponse.json({ user });
  } catch (err) {
    console.error('Update user failed', err);
    return NextResponse.json({ error: 'Unable to update user' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id } = await params;
  if (id === session.uid) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: user } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('id', id)
      .maybeSingle();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete user', error);
      return NextResponse.json({ error: 'Unable to delete user' }, { status: 500 });
    }

    await logAudit(
      session,
      {
        action: 'user.delete',
        entityType: 'users',
        entityId: id,
        details: { email: user.email, role: user.role },
      },
      request,
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete user failed', err);
    return NextResponse.json({ error: 'Unable to delete user' }, { status: 500 });
  }
}
