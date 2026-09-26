import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { sendStudentInvitationEmail } from '@/app/lib/auth/email';
import { generateRandomPassword, hashPassword } from '@/app/lib/auth/password';
import { parseSex } from '@/app/lib/auth/user';
import { logAudit } from '@/app/lib/audit';
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
    return NextResponse.json({ error: 'Only faculty belong to an admin' }, { status: 400 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'A user with this email already exists' }, { status: 409 });
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
      })
      .select('id')
      .single();
    if (error || !created) {
      console.error('Failed to create account', error);
      const message = error?.message?.includes('admin_id')
        ? 'The owning admin must be an admin account'
        : 'Unable to create user';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    await logAudit(
      session,
      { action: 'user.create', entityType: 'users', entityId: created.id, details: { role, by: 'super_admin' } },
      request,
    );

    // The invitation is student-worded; other roles get the password handed over.
    let warning: string | undefined;
    if (role === 'student') {
      const origin = request.headers.get('origin') ?? 'http://localhost:3000';
      const sent = await sendStudentInvitationEmail(email, name, `${origin}/login`, tempPassword);
      if (!sent.success) warning = 'The invitation email could not be sent. Share the temporary password manually.';
    }

    const { users } = await selectAccounts(supabase, { id: created.id });
    return NextResponse.json(
      { user: users[0] ? toAccount(users[0]) : null, password: tempPassword, warning },
      { status: 201 },
    );
  } catch (err) {
    console.error('Create account failed', err);
    return NextResponse.json({ error: 'Unable to create user' }, { status: 500 });
  }
}
