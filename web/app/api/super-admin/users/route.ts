import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { sendStudentInvitationEmail } from '@/app/lib/auth/email';
import { generateRandomPassword, hashPassword } from '@/app/lib/auth/password';
import { parseSex } from '@/app/lib/auth/user';
import { logAudit } from '@/app/lib/audit';
import { roleLabel } from '@/app/lib/role-labels';
import { isAccountRole, selectAccounts, toAccount } from '@/app/lib/super-admin-users';

/** Every account in the system, whichever admin owns it. */
export async function GET() {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;

  try {
    const supabase = getSupabaseAdmin();
    const [accounts, sections] = await Promise.all([
      selectAccounts(supabase),
      supabase.from('sections').select('id, name').order('name'),
    ]);
    if (accounts.error) {
      console.error('Failed to list accounts', accounts.error);
      return NextResponse.json({ error: 'Unable to list users' }, { status: 500 });
    }
    return NextResponse.json({
      users: accounts.users.map(toAccount),
      sections: sections.data ?? [],
      owner_enabled: accounts.ownerEnabled,
    });
  } catch (err) {
    console.error('List accounts failed', err);
    return NextResponse.json({ error: 'Unable to list users' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;
  const { session } = guard;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const role = body.role;
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }
  if (!isAccountRole(role)) return NextResponse.json({ error: 'Invalid role' }, { status: 400 });

  const parsedSex = parseSex(body.sex);
  if (parsedSex.error) return NextResponse.json({ error: parsedSex.error }, { status: 400 });

  const sectionId = typeof body.section_id === 'string' && body.section_id ? body.section_id : null;
  if (sectionId && role !== 'student') {
    return NextResponse.json({ error: 'Only students can be placed in a section' }, { status: 400 });
  }
  const adminId = typeof body.admin_id === 'string' && body.admin_id ? body.admin_id : null;
  if (adminId && role !== 'faculty') {
    return NextResponse.json({ error: 'Only instructors belong to a dean' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
    }

    // An account created from a "Continue with Google" request is tied to that
    // Google account up front, so the person can sign in with it at once.
    let googleSub: string | null = null;
    let googleWarning: string | undefined;
    const requestId = typeof body.request_id === 'string' && body.request_id ? body.request_id : null;
    if (requestId) {
      const { data: requestRow } = await supabase
        .from('notifications')
        .select('data')
        .eq('data->>kind', 'access_request')
        .eq('data->>request_id', requestId)
        .limit(1)
        .maybeSingle();
      const sub = (requestRow?.data as { google_sub?: unknown } | undefined)?.google_sub;
      if (typeof sub === 'string' && sub) {
        const { data: holder } = await supabase.from('users').select('id').eq('google_sub', sub).maybeSingle();
        if (holder) googleWarning = 'The Google account on this request is already connected to another user, so it was not linked.';
        else googleSub = sub;
      }
    }

    const tempPassword = generateRandomPassword();
    const { data: created, error } = await supabase
      .from('users')
      .insert({
        email,
        name,
        role,
        sex: parsedSex.sex ?? null,
        password_hash: await hashPassword(tempPassword),
        force_password_change: true,
        section_id: sectionId,
        ...(adminId ? { admin_id: adminId } : {}),
        ...(googleSub ? { google_sub: googleSub } : {}),
      })
      .select('id')
      .single();
    if (error || !created) {
      console.error('Failed to create account', error);
      const message = error?.message?.includes('admin_id')
        ? 'The owning dean must be a dean account'
        : 'Unable to create user';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    await logAudit(
      session,
      {
        action: 'user.create',
        entityType: 'users',
        entityId: created.id,
        details: { role, by: 'super_admin', google_linked: Boolean(googleSub) },
      },
      request,
    );

    // The temporary password goes only to the new account's inbox. It comes
    // back to the super admin solely when that email fails, so it can still be
    // handed over.
    let warning: string | undefined = googleWarning;
    const sent = await sendStudentInvitationEmail(
      email,
      name,
      tempPassword,
      role === 'student' ? undefined : { roleLabel: roleLabel(role), signInUrl: `${request.nextUrl.origin}/login` },
    );
    if (!sent.success) {
      warning = [warning, 'The welcome email could not be sent. Share the temporary password manually.']
        .filter(Boolean)
        .join(' ');
    }

    const { users } = await selectAccounts(supabase, { id: created.id });
    return NextResponse.json(
      { user: users[0] ? toAccount(users[0]) : null, ...(sent.success ? {} : { password: tempPassword }), warning },
      { status: 201 },
    );
  } catch (err) {
    console.error('Create account failed', err);
    return NextResponse.json({ error: 'Unable to create user' }, { status: 500 });
  }
}
