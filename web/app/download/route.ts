import { NextResponse, type NextRequest } from 'next/server';
import { mobileAppTarget } from '@/app/lib/mobile-app';

/**
 * The app download link every email and portal hands out: redirects to the
 * current APK (MOBILE_APP_URL). Public, since students follow it before they
 * have ever signed in. No caching, so changing the variable takes effect on
 * the next deployment without a stale redirect lingering in browsers.
 */
export function GET(request: NextRequest) {
  const target = mobileAppTarget();
  if (!target) {
    return page(
      'The app isn’t available yet',
      'The iCARE++ app can’t be downloaded from here yet. Ask your instructor for the link.',
      404,
    );
  }
  // An APK can't be installed on an iPhone or iPad, and there is no iOS build.
  if (/iPhone|iPad|iPod/i.test(request.headers.get('user-agent') ?? '')) {
    return page(
      'iCARE++ is for Android phones',
      'There’s no iPhone version yet. Open this link on an Android phone to install the app, or ask your instructor.',
      200,
    );
  }
  const response = NextResponse.redirect(target, 302);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

function page(heading: string, body: string, status: number) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>iCARE++ app</title>
</head>
<body style="margin:0;padding:48px 16px;background:#f4f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:420px;margin:0 auto;background:#fff;border-radius:16px;padding:32px;box-shadow:0 2px 12px rgba(0,0,0,0.06);">
    <p style="margin:0 0 16px;font-size:20px;font-weight:700;color:#0d7377;">iCARE++</p>
    <h1 style="margin:0 0 8px;font-size:18px;">${heading}</h1>
    <p style="margin:0;font-size:15px;line-height:1.6;color:#475569;">${body}</p>
  </div>
</body>
</html>`;
  return new NextResponse(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
