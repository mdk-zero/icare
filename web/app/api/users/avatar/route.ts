import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { readSession } from '@/app/lib/auth/session';
import { getSupabaseAdmin } from '@/app/lib/supabase/server';

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function sanitizeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100);
}

export async function POST(request: Request) {
  const session = await readSession();
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const file = formData.get('avatar');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Avatar file is required' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Only JPEG, PNG, WebP, and GIF images are allowed' },
      { status: 400 },
    );
  }

  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: 'File size must be less than 2 MB' },
      { status: 400 },
    );
  }

  const fileName = `${randomUUID()}-${sanitizeFileName(file.name)}`;
  const path = `avatars/${session.uid}/${fileName}`;

  try {
    const supabase = getSupabaseAdmin();

    const bytes = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, Buffer.from(bytes), {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error('Avatar upload failed', uploadError);
      return NextResponse.json(
        { error: 'Unable to upload avatar. Make sure the avatars bucket exists.' },
        { status: 500 },
      );
    }

    const { error: updateError } = await supabase
      .from('users')
      .update({ picture_url: path })
      .eq('id', session.uid);

    if (updateError) {
      console.error('Failed to update user picture_url', updateError);
      // Best-effort cleanup
      await supabase.storage.from('avatars').remove([path]);
      return NextResponse.json(
        { error: 'Unable to save avatar reference' },
        { status: 500 },
      );
    }

    return NextResponse.json({ path });
  } catch (err) {
    console.error('POST /api/users/avatar failed', err);
    return NextResponse.json({ error: 'Unable to upload avatar' }, { status: 500 });
  }
}
