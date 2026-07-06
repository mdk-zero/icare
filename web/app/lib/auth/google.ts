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
  if (cachedClient) return cachedClient;
  const id = process.env.GOOGLE_CLIENT_ID;
  if (!id) {
    throw new Error('GOOGLE_CLIENT_ID is not set in environment');
  }
  cachedClient = new OAuth2Client(id);
  return cachedClient;
}

export async function verifyGoogleIdToken(idToken: string): Promise<GoogleProfile> {
  const client = getClient();
  const ticket = await client.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
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
