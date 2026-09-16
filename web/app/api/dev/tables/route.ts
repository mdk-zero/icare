import { NextResponse } from 'next/server';
import { listTables } from '@/app/lib/dev/catalog';
import { devErrorResponse, devNotFound, requireDeveloper } from '@/app/lib/dev/guard';

export async function GET() {
  const session = await requireDeveloper();
  if (!session) return devNotFound();

  try {
    const tables = await listTables();
    return NextResponse.json({ tables });
  } catch (err) {
    return devErrorResponse(err);
  }
}
