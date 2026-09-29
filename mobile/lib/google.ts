import * as Google from "expo-auth-session/providers/google";

// Google Cloud Console client IDs — see mobile/.env.example.
//
// Android/iOS client types don't take a manually-registered redirect URI at
// all: Google derives the allowed redirect from the app's real package name
// + the SHA-1 of the build's signing certificate, which only matches when
// running inside an actual build signed with that keystore — NOT inside
// Expo Go (a shared container app with its own package name). So Google
// sign-in only works from a real dev-client/standalone build on Android/iOS;
// the web client id is what makes it work when running on the web platform
// (`expo start --web`), which uses ordinary https redirects.
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

export const GOOGLE_SIGN_IN_CONFIGURED = Boolean(
  GOOGLE_WEB_CLIENT_ID || GOOGLE_IOS_CLIENT_ID || GOOGLE_ANDROID_CLIENT_ID,
);

/**
 * The Google account picker, returning an ID token — shared by sign-in and
 * the Account screen's "Connect to Google". Same tuple as the underlying hook:
 * [request, response, prompt].
 */
export function useGoogleIdToken() {
  return Google.useIdTokenAuthRequest({
    // The hook picks androidClientId/iosClientId/webClientId based on the
    // current platform and only falls back to the generic `clientId` prop
    // when that platform-specific one is undefined — so `clientId` needs
    // its own "nothing configured" placeholder, distinct from webClientId,
    // or Android/iOS throw when only the web client id is set.
    clientId:
      GOOGLE_ANDROID_CLIENT_ID || GOOGLE_IOS_CLIENT_ID || GOOGLE_WEB_CLIENT_ID || "not-configured",
    webClientId: GOOGLE_WEB_CLIENT_ID,
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    androidClientId: GOOGLE_ANDROID_CLIENT_ID,
  });
}

/** The ID token out of a successful picker response, or null. */
export function idTokenFrom(
  response: ReturnType<typeof useGoogleIdToken>[1],
): string | null {
  if (response?.type !== "success") return null;
  return response.params?.id_token ?? response.authentication?.idToken ?? null;
}
