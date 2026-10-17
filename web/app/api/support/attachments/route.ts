import { NextResponse } from 'next/server';
import { readSession } from '@/app/lib/auth/session';
import { consumeRateLimit } from '@/app/lib/auth/rate-limit';
import { storeSupportImage } from '@/app/lib/support-requests';
import { SUPPORT_ATTACHMENTS } from '@/app/lib/support';

const MAX_UPLOADS = 30;
const WINDOW_MS = 60 * 60 * 1000; // an hour

/**
 * POST multipart `file`: one image for a Help & Support message, or for an
 * Admin's reply to one. Returns what the message then names in `attachments`.
 * Images come through here rather than a signed upload URL so the mobile app
 * can reuse its multipart upload; clients shrink them to fit the cap first.
 */
export async function POST(request: Request) {
  const session = await readSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }
  const file = form.get('file');
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose an image to attach.' }, { status: 400 });
  if (!(SUPPORT_ATTACHMENTS.types as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: 'Attach a JPEG, PNG, WebP, or GIF image.' }, { status: 400 });
  }
  if (file.size === 0) return NextResponse.json({ error: 'That image is empty.' }, { status: 400 });
  if (file.size > SUPPORT_ATTACHMENTS.maxBytes) {
    return NextResponse.json({ error: 'Images can be at most 4 MB each.' }, { status: 400 });
  }

  if (!(await consumeRateLimit(`support-image:${session.uid}`, MAX_UPLOADS, WINDOW_MS))) {
    return NextResponse.json({ error: "You've attached a lot of images in the last hour. Please wait a little." }, { status: 429 });
  }

  try {
    return NextResponse.json({ attachment: await storeSupportImage(session.uid, file) });
  } catch (err) {
    console.error('Support image upload failed', err);
    return NextResponse.json({ error: 'That image could not be uploaded. Please try again.' }, { status: 500 });
  }
}
