import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { parseSex } from '@/app/lib/auth/user';
import { logAudit } from '@/app/lib/audit';
import { countSuperAdmins, isAccountRole, selectAccounts, toAccount } from '@/app/lib/super-admin-users';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;
  const { session } = guard;
  const { id } = await params;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 });
    }
    updates.name = body.name.trim();
  }
  if (body.role !== undefined) {
    if (!isAccountRole(body.role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    updates.role = body.role;
  }
  const parsedSex = parseSex(body.sex);
  if (parsedSex.error) return NextResponse.json({ error: parsedSex.error }, { status: 400 });
  if (parsedSex.sex !== undefined) updates.sex = parsedSex.sex;
  if (body.admin_id !== undefined) {
    if (body.admin_id !== null && typeof body.admin_id !== 'string') {
      return NextResponse.json({ error: 'Invalid admin' }, { status: 400 });
    }
    updates.admin_id = body.admin_id || null;
  }
  if (body.section_id !== undefined) {
    if (body.section_id !== null && typeof body.section_id !== 'string') {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }
    updates.section_id = body.section_id || null;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: target } = await supabase.from('users').select('id, role').eq('id', id).maybeSingle();
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const nextRole = (updates.role as string | undefined) ?? (target.role as string);
    if (target.role === 'super_admin' && nextRole !== 'super_admin') {
      if (id === session.uid) {
        return NextResponse.json({ error: 'You cannot change your own role' }, { status: 400 });
      }
      if ((await countSuperAdmins(supabase)) <= 1) {
        return NextResponse.json({ error: 'The last super admin cannot be demoted' }, { status: 400 });
      }
    }
    // A section only means something on a student, an owner only on faculty.
    if (nextRole !== 'student' && updates.section_id) {
      return NextResponse.json({ error: 'Only students can be placed in a section' }, { status: 400 });
    }
    if (nextRole !== 'student' && updates.role !== undefined) updates.section_id = null;

    const { error } = await supabase.from('users').update(updates).eq('id', id);
    if (error) {
      console.error('Failed to update account', error);
      const message = error.message?.includes('admin_id')
        ? 'The owning admin must be an admin account'
        : 'Unable to update user';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    await logAudit(
      session,
      { action: 'user.update', entityType: 'users', entityId: id, details: { ...updates, by: 'super_admin' } },
      request,
    );

    const { users } = await selectAccounts(supabase, { id });
    return NextResponse.json({ user: users[0] ? toAccount(users[0]) : null });
  } catch (err) {
    console.error('Update account failed', err);
    return NextResponse.json({ error: 'Unable to update user' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;
  const { session } = guard;
  const { id } = await params;

  if (id === session.uid) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: target } = await supabase.from('users').select('id, email, role').eq('id', id).maybeSingle();
    if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (target.role === 'super_admin' && (await countSuperAdmins(supabase)) <= 1) {
      return NextResponse.json({ error: 'The last super admin cannot be deleted' }, { status: 400 });
    }

    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) {
      console.error('Failed to delete account', error);
      // 23503: rows elsewhere still point at this account without a cascade.
      const message =
        error.code === '23503'
          ? 'This account still has records that block deletion'
          : 'Unable to delete user';
      return NextResponse.json({ error: message }, { status: error.code === '23503' ? 409 : 500 });
    }

    await logAudit(
      session,
      {
        action: 'user.delete',
        entityType: 'users',
        entityId: id,
        details: { email: target.email, role: target.role, by: 'super_admin' },
      },
      request,
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Delete account failed', err);
    return NextResponse.json({ error: 'Unable to delete user' }, { status: 500 });
  }
}
