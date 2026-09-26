import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { adminVisibleUserIds, getAdminScope } from '@/app/lib/admin-scope';
import { logAudit } from '@/app/lib/audit';
import { parseSex } from '@/app/lib/auth/user';

/** Admin and super admin accounts are the super admin's to make (migration 054). */
const ASSIGNABLE_ROLES = ['student', 'faculty'] as const;

/** Accounts an admin may change or remove: students and faculty, never another admin. */
const MANAGEABLE_ROLES = ['student', 'faculty'];

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

  const { name, role, sex } = body as { name?: unknown; role?: unknown; sex?: unknown };
  const updates: Record<string, unknown> = {};

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    }
    updates.name = name.trim();
  }
  if (role !== undefined) {
    if (id === session.uid) {
      return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 });
    }
    if (typeof role !== 'string' || !(ASSIGNABLE_ROLES as readonly string[]).includes(role)) {
      return NextResponse.json({ error: 'Role must be student or faculty' }, { status: 400 });
    }
    updates.role = role;
  }

  const parsedSex = parseSex(sex);
  if (parsedSex.error) {
    return NextResponse.json({ error: parsedSex.error }, { status: 400 });
  }
  // Absent leaves the recorded value alone; an explicit empty clears it.
  if (parsedSex.sex !== undefined) updates.sex = parsedSex.sex;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    // Only the admin's own accounts (migration 053).
    const scope = await getAdminScope(supabase, session.uid);
    if (scope && !adminVisibleUserIds(scope, session.uid).includes(id)) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    if (id !== session.uid) {
      const { data: target } = await supabase.from('users').select('role').eq('id', id).maybeSingle();
      if (!target || !MANAGEABLE_ROLES.includes(target.role as string)) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }
    }
    // Someone made faculty by this admin becomes this admin's faculty.
    if (scope && updates.role === 'faculty') updates.admin_id = session.uid;
    const { data: user, error } = await supabase
      .from('users')
      .update(updates)
      .eq('id', id)
      .select('id, email, name, role, picture_url, sex, created_at, last_login_at')
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
    const scope = await getAdminScope(supabase, session.uid);
    const { data: user } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('id', id)
      .maybeSingle();
    if (
      !user ||
      !MANAGEABLE_ROLES.includes(user.role as string) ||
      (scope && !adminVisibleUserIds(scope, session.uid).includes(id))
    ) {
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
