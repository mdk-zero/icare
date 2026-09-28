import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { logAudit } from '@/app/lib/audit';
import { applyRoleChangeReporting, parseSex } from '@/app/lib/auth/user';
import { DevError } from '@/app/lib/dev/catalog';
import { devErrorResponse, devNotFound, requireDeveloper } from '@/app/lib/dev/guard';
import { reissueSession, updateUser, type SessionPayload } from '@/app/lib/auth/session';

type Params = { params: Promise<{ id: string }> };

const ROLES = ['student', 'faculty', 'admin'] as const;

export async function PATCH(request: NextRequest, { params }: Params) {
  const session = await requireDeveloper();
  if (!session) return devNotFound();

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => {
      throw new DevError('Invalid JSON body');
    })) as {
      role?: unknown;
      section_id?: unknown;
      name?: unknown;
      email?: unknown;
      sex?: unknown;
      force_password_change?: unknown;
      admin_id?: unknown;
    };

    const patch: Record<string, unknown> = {};

    if (body.role !== undefined) {
      if (typeof body.role !== 'string' || !(ROLES as readonly string[]).includes(body.role)) {
        throw new DevError('Role must be student, instructor, or dean');
      }
      patch.role = body.role;
    }

    if (body.section_id !== undefined) {
      const raw = body.section_id;
      if (raw === null || raw === '') {
        patch.section_id = null;
      } else if (typeof raw === 'string') {
        const supabase = getSupabaseAdmin();
        const { data: section } = await supabase
          .from('sections')
          .select('id')
          .eq('id', raw)
          .maybeSingle();
        if (!section) throw new DevError('Section not found');
        patch.section_id = raw;
      } else {
        throw new DevError('Invalid section_id');
      }
    }

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        throw new DevError('Name cannot be empty');
      }
      patch.name = body.name.trim();
    }

    if (body.email !== undefined) {
      if (typeof body.email !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim())) {
        throw new DevError('Invalid email format');
      }
      patch.email = body.email.trim().toLowerCase();
    }

    if (body.sex !== undefined) {
      const parsed = parseSex(body.sex);
      if (parsed.error) throw new DevError(parsed.error);
      patch.sex = parsed.sex ?? null;
    }

    // The admin a faculty account belongs to (migration 053). The database
    // checks it names an admin and clears it for anyone who isn't faculty.
    if (body.admin_id !== undefined) {
      if (body.admin_id !== null && (typeof body.admin_id !== 'string' || !body.admin_id)) {
        throw new DevError('Invalid admin_id');
      }
      patch.admin_id = body.admin_id;
    }

    if (body.force_password_change !== undefined) {
      patch.force_password_change = Boolean(body.force_password_change);
    }

    if (Object.keys(patch).length === 0) throw new DevError('Nothing to update');

    const supabase = getSupabaseAdmin();
    let previousRole: string | null = null;
    if (patch.role !== undefined) {
      const { data: before, error: beforeError } = await supabase
        .from('users')
        .select('role')
        .eq('id', id)
        .maybeSingle();
      // Without the old role there is no telling whether to revoke.
      if (beforeError) throw new DevError(beforeError.message, 500);
      if (!before) throw new DevError('User not found', 404);
      previousRole = before.role as string;
    }
    // A role change signs the account out everywhere, in the same write.
    const { data, error } = await updateUser(id, patch, {
      revoke: previousRole !== null && patch.role !== previousRole,
      columns: 'id, email, name, role, sex, section_id, force_password_change',
    });
    if (error) throw new DevError(error.message, 400);
    if (!data) throw new DevError('User not found', 404);

    await logAudit(
      session,
      {
        action: 'dev.user.update',
        entityType: 'users',
        entityId: id,
        details: { fields: Object.keys(patch) },
      },
      request,
    );
    // Sessions read the live role, and a change signs the account out
    // everywhere, so nothing lingers under the old role.
    const warning = previousRole ? await applyRoleChangeReporting(supabase, id, data.role as string) : undefined;
    // Changing their own role signs the developer out with everyone else's
    // sessions; keep this console session going.
    if (previousRole && previousRole !== data.role && id === session.uid) {
      await reissueSession({ ...session, role: data.role as SessionPayload['role'] });
    }

    return NextResponse.json({ user: data, warning });
  } catch (err) {
    return devErrorResponse(err);
  }
}

export async function DELETE(request: NextRequest, { params }: Params) {
  const session = await requireDeveloper();
  if (!session) return devNotFound();

  try {
    const { id } = await params;
    if (id === session.uid) {
      throw new DevError('You cannot delete the account you are signed in as');
    }

    const supabase = getSupabaseAdmin();
    const { data: target } = await supabase
      .from('users')
      .select('id, email, name, role')
      .eq('id', id)
      .maybeSingle();
    if (!target) throw new DevError('User not found', 404);

    const { error } = await supabase.from('users').delete().eq('id', id);
    if (error) {
      // A restrict/no-action FK surfaces here; the references preview is what
      // tells the developer which table is holding the row.
      throw new DevError(error.message, 400);
    }

    await logAudit(
      session,
      {
        action: 'dev.user.delete',
        entityType: 'users',
        entityId: id,
        details: { email: target.email, role: target.role },
      },
      request,
    );
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return devErrorResponse(err);
  }
}
