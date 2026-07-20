import { OAuth2Client } from 'google-auth-library';

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string | null;
}

let cachedClient: OAuth2Client | null = null;

function getClient(): OAuth2Client {
  if (!cachedClient) cachedClient = new OAuth2Client();
  return cachedClient;
}

/**
 * Google issues a different `aud` claim per OAuth client, so the mobile app's
 * native/Expo client IDs must be accepted alongside the web client's — the
 * account itself is identified by `sub`, which is stable across clients.
 */
function getAllowedAudiences(): string[] {
  const ids = [
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_IOS_CLIENT_ID,
    process.env.GOOGLE_ANDROID_CLIENT_ID,
  ].filter((id): id is string => Boolean(id));
  if (ids.length === 0) {
    throw new Error('GOOGLE_CLIENT_ID is not set in environment');
  }
  return ids;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const client = getClient();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: getAllowedAudiences(),
  });
  const payload = ticket.getPayload();
  if (!payload) throw new Error('Empty Google ID token payload');
  if (!payload.sub || !payload.email || !payload.name) {
    throw new Error('Google ID token missing required claims');
  }
  return {
    sub: payload.sub,
    email: payload.email,
    emailVerified: Boolean(payload.email_verified),
    name: payload.name,
    picture: payload.picture ?? null,
  };
}
