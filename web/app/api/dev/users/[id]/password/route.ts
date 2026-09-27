import { NextRequest, NextResponse } from 'next/server';
import { generateRandomPassword, hashPassword } from '@/app/lib/auth/password';
import { logAudit } from '@/app/lib/audit';
import { reissueSession, updateUser } from '@/app/lib/auth/session';
import { DevError } from '@/app/lib/dev/catalog';
import { devErrorResponse, devNotFound, requireDeveloper } from '@/app/lib/dev/guard';

type Params = { params: Promise<{ id: string }> };

/**
 * Sets a password directly, with no email round-trip. Returns the plaintext
 * once — it is hashed on the way into the database and cannot be read back.
 */
export async function POST(request: NextRequest, { params }: Params) {
  const session = await requireDeveloper();
  if (!session) return devNotFound();

  try {
    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      password?: unknown;
      force_change?: unknown;
    };

    let plaintext: string;
    if (body.password === undefined || body.password === null || body.password === '') {
      plaintext = generateRandomPassword();
    } else if (typeof body.password === 'string' && body.password.length >= 8) {
      plaintext = body.password;
    } else {
      throw new DevError('Password must be at least 8 characters');
    }

    // Whoever held the old password, or a session opened with it, is out.
    const { data, error } = await updateUser(
      id,
      { password_hash: await hashPassword(plaintext), force_password_change: body.force_change !== false },
      { revoke: true, columns: 'id, email, name' },
    );
    if (error) throw new DevError(error.message, 400);
    if (!data) throw new DevError('User not found', 404);

    await logAudit(
      session,
      {
        action: 'dev.user.password',
        entityType: 'users',
        entityId: id,
        details: { generated: body.password === undefined || body.password === '' },
      },
      request,
    );
    // Resetting their own password signs the developer out with every other
    // session; keep this console session going.
    if (id === session.uid) await reissueSession(session);
    return NextResponse.json({ user: data, password: plaintext });
  } catch (err) {
    return devErrorResponse(err);
  }
}
