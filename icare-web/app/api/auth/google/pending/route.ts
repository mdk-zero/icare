import { NextResponse } from 'next/server';
import { readGoogleOnboarding } from '@/app/lib/auth/session';

export async function GET() {
  const pending = await readGoogleOnboarding();
  if (!pending) {
    return NextResponse.json(
      { error: 'No pending Google sign-in' },
      { status: 404 },
    );
  }
  return NextResponse.json({ profile: pending });
}
