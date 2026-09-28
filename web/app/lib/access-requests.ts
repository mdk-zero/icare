import { getSupabaseAdmin } from '@/app/lib/supabase/server';

/** What a contact-form account request carries in each notification copy. */
export type AccessRequestData = {
  kind: 'access_request';
  request_id: string;
  status: 'pending' | 'accepted' | 'declined';
  name: string;
  email: string;
  sex?: 'female' | 'male';
  subject: string;
  [key: string]: unknown;
};

/**
 * The request still waiting on a super admin for this address, if any. A
 * declined one doesn't count, so the person can ask again. Fails open: a
 * lookup error shouldn't block a genuine first request.
 */
export async function findPendingAccessRequest(email: string): Promise<AccessRequestData | null> {
  try {
    // ilike for a case-insensitive match; escape its wildcards so the address
    // is matched literally.
    const pattern = email.replace(/[\\%_]/g, (c) => `\\${c}`);
    const { data, error } = await getSupabaseAdmin()
      .from('notifications')
      .select('data')
      .eq('data->>kind', 'access_request')
      .eq('data->>status', 'pending')
      .ilike('data->>email', pattern)
      .order('created_at', { ascending: true })
      .limit(1);
    if (error) throw error;
    return (data?.[0]?.data as AccessRequestData | undefined) ?? null;
  } catch (err) {
    console.error('Pending access request lookup failed', err);
    return null;
  }
}
