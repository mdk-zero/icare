import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';
import { requireSuperAdmin } from '@/app/lib/auth/super-admin';
import { generateRandomPassword, hashPassword } from '@/app/lib/auth/password';
import { logAudit } from '@/app/lib/audit';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * Issues a temporary password the account must change at next sign-in.
 * The plaintext is returned once and is never readable again.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const guard = await requireSuperAdmin();
  if (guard.response) return guard.response;
  const { id } = await params;

  try {
    const supabase = getSupabaseAdmin();
    const password = generateRandomPassword();
    const { data, error } = await supabase
      .from('users')
      .update({ password_hash: await hashPassword(password), force_password_change: true })
      .eq('id', id)
      .select('id')
      .maybeSingle();
    if (error) {
      console.error('Failed to reset password', error);
      return NextResponse.json({ error: 'Unable to reset password' }, { status: 500 });
    }
    if (!data) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    await logAudit(
      guard.session,
      { action: 'user.password_reset', entityType: 'users', entityId: id, details: { by: 'super_admin' } },
      request,
    );
    return NextResponse.json({ password });
  } catch (err) {
    console.error('Reset password failed', err);
    return NextResponse.json({ error: 'Unable to reset password' }, { status: 500 });
  }
}
