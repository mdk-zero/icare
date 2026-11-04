import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { requireDean } from '@/app/lib/auth/dean';
import { parseSex } from '@/app/lib/auth/user';
import { sendStudentInvitationEmail } from '@/app/lib/auth/email';
import { generateRandomPassword, hashPassword } from '@/app/lib/auth/password';
import { logAudit } from '@/app/lib/audit';
import { roleLabel } from '@/app/lib/role-labels';
import { listProgramChairs, PROGRAM_CHAIR_COLUMNS } from '@/app/lib/program-chairs';

/** The signed-in Dean's Program Chairs. A Program Chair can't open this (requireDean). */
export async function GET() {
  const guard = await requireDean();
  if (guard.response) return guard.response;

  try {
    const program_chairs = await listProgramChairs(getSupabaseAdmin(), guard.session.uid);
    return NextResponse.json({ program_chairs });
  } catch (err) {
    console.error('List Program Chairs failed', err);
    return NextResponse.json({ error: 'Unable to list Program Chairs' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireDean();
  if (guard.response) return guard.response;
  const { session } = guard;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: 'Enter a valid email address' }, { status: 400 });
  }
  const parsedSex = parseSex(body.sex);
  if (parsedSex.error) return NextResponse.json({ error: parsedSex.error }, { status: 400 });

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
        role: 'admin',
        admin_title: 'program_chair',
        // The trigger gives them this Dean's institution too (087).
        admin_id: session.uid,
        sex: parsedSex.sex ?? null,
        password_hash: await hashPassword(tempPassword),
        force_password_change: true,
      })
      .select(`${PROGRAM_CHAIR_COLUMNS}, admin_id`)
      .single();
    if (error || !created) {
      console.error('Failed to create a Program Chair', error);
      return NextResponse.json({ error: 'Unable to create the Program Chair' }, { status: 500 });
    }

    // Before 087 the database drops the owner without an error, which would
    // leave an account no Dean can see. Nothing has been sent yet, so undo it.
    const { admin_id: owner, ...user } = created as unknown as { admin_id: string | null; id: string };
    if (owner !== session.uid) {
      await supabase.from('users').delete().eq('id', user.id);
      return NextResponse.json(
        { error: "Adding Program Chairs needs migration 087, which isn't applied yet" },
        { status: 503 },
      );
    }

    await logAudit(
      session,
      {
        action: 'user.create',
        entityType: 'users',
        entityId: user.id,
        details: { role: 'admin', admin_title: 'program_chair', by: 'dean' },
      },
      request,
    );

    // The temporary password goes only to the new account's inbox. It comes
    // back to the Dean solely when that email fails, so it can still be
    // handed over.
    const sent = await sendStudentInvitationEmail(email, name, tempPassword, {
      roleLabel: roleLabel('admin', 'program_chair'),
      signInUrl: `${request.nextUrl.origin}/login`,
      origin: 'dean',
    });

    return NextResponse.json(
      {
        user: { ...user, instructor_count: 0, student_count: 0 },
        ...(sent.success
          ? {}
          : {
              password: tempPassword,
              warning: `Account created, but the welcome email could not be sent. Share the temporary password below manually. Reason: ${sent.error}`,
            }),
      },
      { status: 201 },
    );
  } catch (err) {
    console.error('Create Program Chair failed', err);
    return NextResponse.json({ error: 'Unable to create the Program Chair' }, { status: 500 });
  }
}
