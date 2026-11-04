import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { useAuth } from '@/hooks/useAuth';
import { fetchAiConsent } from '@/lib/api';

/**
 * Asks a student who hasn't answered yet whether to allow AI features, once
 * they're signed in and past any forced password change. Offline, or on a
 * server without the question, it waits for the next launch; nothing goes to
 * the AI until they say yes.
 */
export function useAiConsentPrompt() {
  const { user } = useAuth();
  const router = useRouter();
  const userId = user?.role === 'student' && !user.force_password_change ? user.id : null;

  useEffect(() => {
    if (!userId) return;
    let live = true;
    fetchAiConsent()
      .then(({ consent, available }) => {
        if (live && available && consent === null) router.push('/ai-consent');
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [userId, router]);
}
