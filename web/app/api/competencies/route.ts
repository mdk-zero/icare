import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

export async function GET() {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('competency_areas')
      .select('id, name, description')
      .order('name', { ascending: true });

    if (error) {
      console.error('Failed to fetch competencies', error);
      return NextResponse.json({ error: 'Unable to fetch competencies' }, { status: 500 });
    }

    return NextResponse.json({ competencies: data ?? [] });
  } catch (err) {
    console.error('Fetch competencies failed', err);
    return NextResponse.json({ error: 'Unable to fetch competencies' }, { status: 500 });
  }
}
